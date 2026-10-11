import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { getScopedTask, findScopedTasks } from "../clickup/client.js";
import { ReadFailure, requireReadGrant } from "../clickup/policy.js";
import { createAttentionReport } from "../reports/attention.js";

export interface ReadDependencies {
  readonly bindings: unknown;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

const SERVICE_INFO = Object.freeze({
  phase: 3,
  liveClickUp: false,
  authentication: "github-oauth-required",
  note: "Phase 3 read-only diagnostic; GitHub OAuth gates the public MCP endpoint. Live ClickUp access is disabled.",
});

function toolError(error: unknown) {
  const code = error instanceof ReadFailure ? error.code : "CLICKUP_UNAVAILABLE";
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ code }) }],
  };
}

function toolSuccess(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function createServer(deps?: ReadDependencies): McpServer {
  const server = new McpServer({ name: "neonsales-clickup-mcp", version: "0.2.0" });

  server.registerTool(
    "service_info",
    {
      description:
        "Read-only Phase 3 staging diagnostic; reports OAuth requirement and ClickUp disabled status.",
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

  if (!deps) return server;
  const dependencies = deps;

  server.registerTool(
    "find_scoped_tasks",
    {
      description:
        "Read up to 50 tasks from the one server-authorized ClickUp List. Results may be incomplete; never searches arbitrary Lists.",
      inputSchema: fromJsonSchema<{ max_results?: number; status?: string }>({
        type: "object",
        properties: {
          max_results: { type: "integer", minimum: 1, maximum: 50 },
          status: { type: "string", minLength: 1, maxLength: 64 },
        },
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args, extra) => {
      try {
        const grant = requireReadGrant(extra.http?.authInfo, dependencies.bindings);
        const result = await findScopedTasks(
          grant,
          dependencies.fetcher ?? fetch,
          args.max_results ?? 20,
          args.status,
        );
        return toolSuccess({ ...result });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_scoped_task",
    {
      description: "Read one task by ID, only if its verified home List matches the server-side grant.",
      inputSchema: fromJsonSchema<{ task_id: string }>({
        type: "object",
        properties: {
          task_id: { type: "string", minLength: 2, maxLength: 40, pattern: "^[a-zA-Z0-9_-]+$" },
        },
        required: ["task_id"],
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args, extra) => {
      try {
        const grant = requireReadGrant(extra.http?.authInfo, dependencies.bindings);
        const result = await getScopedTask(grant, args.task_id, dependencies.fetcher ?? fetch);
        return toolSuccess({ source: "clickup-api-v2", ...result });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_attention_report",
    {
      description:
        "Read-only scoped metadata summary: overdue, due soon, and not updated for 48h. Staleness does not prove inactivity.",
      inputSchema: fromJsonSchema<{ lookahead_hours?: number; include_overdue?: boolean }>({
        type: "object",
        properties: {
          lookahead_hours: { type: "integer", minimum: 1, maximum: 48 },
          include_overdue: { type: "boolean" },
        },
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args, extra) => {
      try {
        const grant = requireReadGrant(extra.http?.authInfo, dependencies.bindings);
        const result = await findScopedTasks(grant, dependencies.fetcher ?? fetch, 50);
        const report = createAttentionReport(
          result.tasks,
          result.list_id,
          result.pages_scanned,
          result.incomplete,
          args.lookahead_hours ?? 24,
          args.include_overdue ?? true,
          (dependencies.now ?? Date.now)(),
        );
        return toolSuccess({ ...report });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
