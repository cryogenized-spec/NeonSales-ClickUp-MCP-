import { fromJsonSchema, type McpServer } from "@modelcontextprotocol/server";
import {
  PLANNED_TOOLS,
  plannedDescription,
  plannedInputSchema,
  type PlannedTool,
} from "./planned-tool-catalog.js";

const UNAVAILABLE_OUTPUT = Object.freeze({
  type: "object",
  properties: {
    status: { type: "string", const: "unavailable" },
    code: { type: "string", const: "CLICKUP_TOOL_NOT_IMPLEMENTED" },
    tool: { type: "string", minLength: 1 },
    note: { type: "string", minLength: 1 },
  },
  required: ["status", "code", "tool", "note"],
  additionalProperties: false,
});

export function registerPlannedTools(server: McpServer): void {
  for (const tool of PLANNED_TOOLS) {
    const warning = {
      status: "unavailable" as const,
      code: "CLICKUP_TOOL_NOT_IMPLEMENTED" as const,
      tool: tool.name,
      note:
        "Schema-only: no ClickUp read or write was attempted. " +
        "This capability requires a separately reviewed backend and permission gate.",
    };
    server.registerTool(
      tool.name,
      {
        title: tool.title + " (not implemented)",
        description: plannedDescription(tool),
        inputSchema: fromJsonSchema<Record<string, unknown>>(plannedInputSchema(tool)),
        outputSchema: fromJsonSchema<typeof warning>(UNAVAILABLE_OUTPUT),
        annotations: {
          title: tool.title + " (not implemented)",
          readOnlyHint: tool.risk === "read",
          destructiveHint: tool.risk === "destructive",
          idempotentHint: tool.risk === "read",
          openWorldHint: false,
        },
      },
      async () => ({
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify(warning) }],
        structuredContent: warning,
      }),
    );
  }
}

/** Safe discovery: no tokens, task data, secrets, or staff identities. */
export function catalogSnapshot() {
  return {
    source: "neonsales-clickup-mcp",
    version: 1,
    status: "schema-only-for-planned-operations",
    implemented: [
      {
        name: "find_scoped_tasks",
        behavior: "read-only-implemented-needs-runtime-config",
        permission: "server-configured-list-read",
      },
      {
        name: "get_scoped_task",
        behavior: "read-only-implemented-needs-runtime-config",
        permission: "server-configured-list-read",
      },
      {
        name: "get_attention_report",
        behavior: "read-only-implemented-needs-runtime-config",
        permission: "server-configured-list-read",
      },
    ],
    planned: PLANNED_TOOLS.map((tool: PlannedTool) => ({
      name: tool.name,
      category: tool.category,
      title: tool.title,
      operation: tool.risk,
      status: "not-implemented",
    })),
    policy:
      "Only the three scoped read tools have a backend. All other cataloged tools are schema-only no-ops; no ClickUp mutation is possible.",
  };
}
