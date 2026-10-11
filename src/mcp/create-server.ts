import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { getScopedTask, findScopedTasks } from "../clickup/client.js";
import { ReadFailure, requireReadGrant } from "../clickup/policy.js";
import { createAttentionReport } from "../reports/attention.js";
import { registerPlannedTools, catalogSnapshot } from "./register-planned-tools.js";
import {
  FIND_TASKS_OUTPUT_SCHEMA,
  GET_TASK_OUTPUT_SCHEMA,
  ATTENTION_REPORT_OUTPUT_SCHEMA,
  SERVICE_INFO_OUTPUT_SCHEMA,
  TOOL_CATALOG_OUTPUT_SCHEMA,
} from "./output-schemas.js";

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
        "Report service phase and OAuth requirement without touching ClickUp. Use first to distinguish diagnostic server operation from live backend connectivity; this tool does not authenticate anyone, authorize a task, or demonstrate access to ClickUp data.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      outputSchema: fromJsonSchema<Record<string, unknown>>(SERVICE_INFO_OUTPUT_SCHEMA),
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
        "Find tasks in the ONE server-authorized ClickUp home List. Use to browse tasks or filter by exact status, then inspect IDs with get_scoped_task. Returns up to 50 bounded results plus source, pages_scanned and incomplete. Do not claim global Workspace search or completeness if incomplete is true. This operation only works after a separately approved read grant and staging credentials.",
      inputSchema: fromJsonSchema<{ max_results?: number; status?: string }>({
        type: "object",
        properties: {
          max_results: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description:
              "Result cap (default 20); examine incomplete before treating a search as exhaustive.",
          },
          status: {
            type: "string",
            minLength: 1,
            maxLength: 64,
            description:
              "Optional exact ClickUp status label, case-insensitive. Not a search query.",
          },
        },
        additionalProperties: false,
      }),
      outputSchema: fromJsonSchema<Record<string, unknown>>(FIND_TASKS_OUTPUT_SCHEMA),
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
      description:
        "Retrieve minimal metadata for one specific ClickUp task by its exact task ID. Use find_scoped_tasks first if the user knows only the title. The server compares the task's verified home List with the authorized List. Never accept user-supplied List IDs as authorization; returns no descriptions or unrelated List data.",
      inputSchema: fromJsonSchema<{ task_id: string }>({
        type: "object",
        properties: {
          task_id: {
            type: "string",
            minLength: 2,
            maxLength: 40,
            pattern: "^[a-zA-Z0-9_-]+$",
            description: "Exact ClickUp task ID (not title or URL).",
          },
        },
        required: ["task_id"],
        additionalProperties: false,
      }),
      outputSchema: fromJsonSchema<Record<string, unknown>>(GET_TASK_OUTPUT_SCHEMA),
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
        "Prepare a scoped task attention summary: past-due tasks, tasks due within lookahead_hours, and tasks whose metadata has not changed for at least 48h. Use for daily management reviews; include SAST and UTC time, source, pages_scanned and incomplete. A stale task is NOT evidence an employee did no work. The report can cover at most 50 tasks, never an entire unknown Workspace.",
      inputSchema: fromJsonSchema<{ lookahead_hours?: number; include_overdue?: boolean }>({
        type: "object",
        properties: {
          lookahead_hours: {
            type: "integer",
            minimum: 1,
            maximum: 48,
            description: "Forward deadline window 1–48 hours, default 24.",
          },
          include_overdue: {
            type: "boolean",
            description: "Whether past-due tasks appear, default true.",
          },
        },
        additionalProperties: false,
      }),
      outputSchema: fromJsonSchema<Record<string, unknown>>(ATTENTION_REPORT_OUTPUT_SCHEMA),
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

  // Planned operations have complete schemas but deliberately no REST implementations.
  registerPlannedTools(server);
  server.registerTool(
    "get_tool_catalog",
    {
      title: "Inspect ClickUp MCP capabilities",
      description:
        "Return the capability manifest with actual implementation status. Call before planning a multi-step workflow, especially before any requested write. Never treat a schema-only tool as available. No staff IDs, secrets, or task content are returned.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      outputSchema: fromJsonSchema<Record<string, unknown>>(TOOL_CATALOG_OUTPUT_SCHEMA),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const snapshot = catalogSnapshot();
      return {
        content: [{ type: "text", text: JSON.stringify(snapshot) }],
        structuredContent: snapshot,
      };
    },
  );

  return server;
}
