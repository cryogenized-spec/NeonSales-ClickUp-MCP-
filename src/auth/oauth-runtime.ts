import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createProtocolHandler } from "../mcp/handler.js";
import { requireActivePrincipal } from "./staff.js";
import { handleAuthorizationPage } from "./authorize.js";
import type { OAuthEnv } from "./env.js";

/**
 * Cloudflare OAuthProvider supplies authenticated ctx.props and ctx.auth only after
 * verifying a resource-audience-bound token. An ordinary exported handler avoids
 * introducing a second runtime-specific WorkerEntrypoint class.
 */
export function handleOAuthRequest(
  request: Request,
  env: OAuthEnv,
  context: Parameters<OAuthProvider<OAuthEnv>["fetch"]>[2],
  origin: string,
): Promise<Response> {
  const provider = new OAuthProvider<OAuthEnv>({
    apiRoute: "/mcp",
    apiHandler: {
      async fetch(incoming, currentEnv, ctx) {
        if (new URL(incoming.url).pathname !== "/mcp") return new Response(null, { status: 404 });
        const verified = ctx as unknown as {
          props?: { readonly userId?: unknown };
          auth?: { readonly userId?: unknown; readonly scope?: unknown };
        };
        if (!verified.props || !verified.auth || !Array.isArray(verified.auth.scope)) {
          return new Response("Forbidden", { status: 403 });
        }
        try {
          requireActivePrincipal(
            verified.props,
            verified.auth.userId,
            verified.auth.scope as string[],
            currentEnv.ALLOWED_GITHUB_IDS,
          );
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
        return createProtocolHandler().fetch(incoming);
      },
    },
    defaultHandler: {
      fetch: (incoming, currentEnv) => handleAuthorizationPage(incoming, currentEnv, origin),
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["mcp:read"],
    requiredScopes: ["mcp:read"],
    resourceMetadata: {
      resource: origin + "/mcp",
      authorization_servers: [origin],
      resource_name: "NeonSales ClickUp MCP",
    },
    clientIdMetadataDocumentEnabled: true,
  });
  return provider.fetch(request, env, context);
}
