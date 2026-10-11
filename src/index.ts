import type { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { configurationUnavailable, validatedOAuthOrigin, type OAuthEnv } from "./auth/env.js";

/** No query/header/test escape hatch can expose MCP without full OAuth configuration. */
export default {
  async fetch(
    request: Request,
    env?: OAuthEnv,
    context?: Parameters<OAuthProvider<OAuthEnv>["fetch"]>[2],
  ): Promise<Response> {
    const origin = validatedOAuthOrigin(env, request);
    if (!origin || !env || !context) {
      if (new URL(request.url).pathname === "/mcp") return configurationUnavailable();
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    const { handleOAuthRequest } = await import("./auth/oauth-runtime.js");
    return handleOAuthRequest(request, env, context, origin);
  },
};

export { ClickUpQuota } from "./clickup/quota-object.js";
