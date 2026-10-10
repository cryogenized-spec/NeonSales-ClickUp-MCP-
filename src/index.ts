import { configurationUnavailable, validatedOAuthOrigin, type OAuthEnv } from "./auth/env.js";

/**
 * Public Worker entrypoint. The official Cloudflare OAuth provider is only loaded when the
 * deployment has a valid HTTPS origin, a real KV binding, upstream credentials and staff list.
 * No test/header/query-string escape hatch may enable unauthenticated MCP.
 */
export default {
  async fetch(request: Request, env?: OAuthEnv, context?: ExecutionContext): Promise<Response> {
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
