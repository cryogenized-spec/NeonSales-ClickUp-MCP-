import { WorkerEntrypoint } from "cloudflare:workers";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createProtocolHandler } from "../mcp/handler.js";
import { requireActivePrincipal } from "./staff.js";
import { handleAuthorizationPage } from "./authorize.js";
import type { OAuthEnv } from "./env.js";

class AuthorizedMcpHandler extends WorkerEntrypoint<OAuthEnv, { userId: string }> {
  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/mcp") return new Response(null, { status: 404 });
    // OAuthProvider validates bearer token, issuer, expiry and audience before this class runs.
    // Its context derives from encrypted grant props, never client headers or tool arguments.
    const verified = this.ctx as typeof this.ctx & {
      auth?: { readonly userId?: unknown; readonly scope?: readonly string[] };
    };
    const claims = verified.auth;
    if (!claims || !Array.isArray(claims.scope)) {
      return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    try {
      requireActivePrincipal(
        this.ctx.props,
        claims.userId,
        claims.scope,
        this.env.ALLOWED_GITHUB_IDS,
      );
    } catch {
      return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    // The handler factory creates a new SDK instance per request — never a global principal.
    return createProtocolHandler().fetch(request);
  }
}

export async function handleOAuthRequest(
  request: Request,
  env: OAuthEnv,
  context: ExecutionContext,
  origin: string,
): Promise<Response> {
  const provider = new OAuthProvider<OAuthEnv>({
    apiRoute: "/mcp",
    apiHandler: AuthorizedMcpHandler,
    defaultHandler: {
      fetch: (incoming, currentEnv) => handleAuthorizationPage(incoming, currentEnv, origin),
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["mcp:read", "offline_access"],
    requiredScopes: ["mcp:read"],
    resourceMetadata: {
      resource: origin + "/mcp",
      authorization_servers: [origin],
      resource_name: "NeonSales ClickUp MCP",
      scopes_supported: ["mcp:read"],
    },
    clientIdMetadataDocumentEnabled: true,
  });
  return provider.fetch(request, env, context);
}
