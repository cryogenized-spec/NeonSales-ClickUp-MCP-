import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";

const SERVICE_INFO = Object.freeze({
  phase: 3,
  liveClickUp: false,
  authentication: "github-oauth-required",
  note: "Phase 3 read-only diagnostic; GitHub OAuth gates the public MCP endpoint. Live ClickUp access is disabled.",
});

export function createServer(): McpServer {
  const server = new McpServer({ name: "neonsales-clickup-mcp", version: "0.2.0" });

  server.registerTool(
    "service_info",
    {
      description: "Read-only Phase 3 staging diagnostic; reports OAuth requirement and ClickUp disabled status.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(SERVICE_INFO) }],
      structuredContent: SERVICE_INFO,
    }),
  );

  return server;
}
