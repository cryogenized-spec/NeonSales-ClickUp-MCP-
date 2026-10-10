import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

const SERVICE_INFO = Object.freeze({
  phase: 2,
  liveClickUp: false,
  authentication: "not-configured",
  note: "Internal SDK contract test only; no live ClickUp tasks or OAuth.",
});

export function createServer(): McpServer {
  const server = new McpServer({ name: "neonsales-clickup-mcp", version: "0.2.0" });

  server.registerTool(
    "service_info",
    {
      description: "Non-sensitive phase-2 diagnostic. Never indicates live connectivity.",
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(SERVICE_INFO) }],
      structuredContent: SERVICE_INFO,
    }),
  );

  return server;
}
