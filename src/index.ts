/**
 * Public Worker is deliberately inert during Phase 2.
 *
 * No alternate path, header, query string, staff identity, or test-mode
 * override is allowed to expose the internal MCP protocol handler.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/mcp") {
      return new Response(JSON.stringify({ code: "AUTH_NOT_CONFIGURED" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  },
};
