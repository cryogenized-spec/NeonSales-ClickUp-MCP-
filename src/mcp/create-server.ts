import { McpServer, fromJsonSchema, requireScopes } from "@modelcontextprotocol/server";
import { getScopedTask, findScopedTasks } from "../clickup/client.js";
import { ReadFailure, requireReadGrant, requireWriteGrant } from "../clickup/policy.js";
import {
  createScopedTask,
  getScopedList,
  verifyListWorkspace,
  type TaskInput,
} from "../clickup/operations.js";
import {
  beginClickUpOAuth,
  clickUpConnectionStatus,
  disconnectClickUp,
} from "../clickup/per-user-oauth.js";
import { OPERATIONAL_CATALOG_NAMES, runCatalogOperation } from "../clickup/catalog-runtime.js";
import { createAttentionReport } from "../reports/attention.js";
import {
  CLICKUP_MODEL_TOOL_CATALOG,
  CLICKUP_TOOL_GROUPS,
  catalogPage,
  type ToolGroup,
} from "./tool-catalog.js";

export interface ReadDependencies {
  readonly bindings: unknown;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  /** Test-only isolated SDK schema preview. Never enabled by Worker env bindings. */
  readonly schemaPreview?: boolean;
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

  // Retain the historical Phase 3 diagnostic for a standalone SDK test,
  // but never misreport a configured Phase 6 Worker as Phase 3 read-only.
  const settings =
    deps?.bindings && typeof deps.bindings === "object"
      ? (deps.bindings as Record<string, unknown>)
      : null;
  const runtimeInfo = settings
    ? {
        phase: 6,
        liveClickUp:
          settings["CLICKUP_LIVE_ENABLED"] === "true" &&
          settings["CLICKUP_OAUTH_ENABLED"] === "true",
        authentication: "github-oauth-plus-individual-clickup-oauth",
        note: "Activation flags only, NOT evidence of a completed ClickUp connection. Task activity stays in ClickUp; tool approvals stay in the MCP client.",
      }
    : SERVICE_INFO;

  server.registerTool(
    "service_info",
    {
      description:
        "Describe this instance, configured activation flags, per-user OAuth and native ClickUp history. Flags do not prove live ClickUp connectivity.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(runtimeInfo) }],
      structuredContent: runtimeInfo,
    }),
  );

  if (!deps) return server;
  const dependencies = deps;

  // Single authorization path: verified MCP identity, personal ClickUp token
  // and live List ancestry in the designated Workspace BEFORE data access.
  // Client-side tool confirmations are intentionally not replicated here.
  async function scopedGrant(auth: unknown, write = false) {
    const grant = write
      ? await requireWriteGrant(auth, dependencies.bindings)
      : await requireReadGrant(auth, dependencies.bindings);
    await verifyListWorkspace(grant, dependencies.fetcher ?? fetch);
    return grant;
  }

  server.registerTool(
    "connect_clickup_account",
    {
      description:
        "Connect YOUR OWN individual ClickUp account by OAuth. Returns a one-time ClickUp authorization URL to open in a browser. Requires consent for the approved Workspace; credentials stay encrypted on Cloudflare and never appear in tool output. This does not modify any ClickUp task. Never connect on behalf of another staff member.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (_args, extra) => {
      try {
        return toolSuccess(await beginClickUpOAuth(extra.http?.authInfo, dependencies.bindings));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_clickup_connection_status",
    {
      description:
        "Check your OWN ClickUp OAuth connection; returns no secrets, only connection status and authenticated ClickUp user/Workspace IDs. Connection never grants permission to modify tasks.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (_args, extra) => {
      try {
        return toolSuccess(
          await clickUpConnectionStatus(extra.http?.authInfo, dependencies.bindings),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "disconnect_clickup_account",
    {
      description:
        "Delete YOUR OWN locally stored ClickUp OAuth credential, preventing further NeonSales MCP requests on that account. This does NOT revoke the app in ClickUp itself; use ClickUp Connected Apps to revoke it there. Call only after explicit user instruction.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (_args, extra) => {
      try {
        return toolSuccess(await disconnectClickUp(extra.http?.authInfo, dependencies.bindings));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "clickup_tool_catalog",
    {
      description:
        "Discover the proposed ClickUp tool schemas and natural-language purposes by category. This is a local, read-only metadata catalogue, NOT a live ClickUp API call. Every listed schema_only capability is intentionally unavailable until separately implemented, authorized and reviewed; do not attempt it for live work. Use the implemented find_scoped_tasks, get_scoped_task and get_attention_report for permitted real reads after configuration.",
      inputSchema: fromJsonSchema<{
        group?: ToolGroup;
        page?: number;
        max_results?: number;
        include_schema?: boolean;
      }>({
        type: "object",
        properties: {
          group: {
            type: "string",
            enum: [...CLICKUP_TOOL_GROUPS],
            description: "Optional capability category to inspect; omit to list all.",
          },
          page: {
            type: "integer",
            minimum: 0,
            maximum: 99,
            description: "Zero-based catalogue page.",
          },
          max_results: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Number of catalogue entries returned per page; default 10.",
          },
          include_schema: {
            type: "boolean",
            description: "Include exact closed JSON input schemas, not just tool names/purpose.",
          },
        },
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        const page = catalogPage({
          group: args.group,
          page: args.page,
          maxResults: args.max_results,
          includeSchema: args.include_schema,
        });
        return toolSuccess({
          source: "clickup-capability-catalog",
          status: dependencies.schemaPreview === true ? "schema_only" : "mixed",
          explanation:
            "Entries marked operational have ClickUp REST backends; schema_only requires implementation. This catalogue does not itself invoke ClickUp.",
          ...page,
          entries: page.entries.map((entry) => ({
            ...entry,
            status:
              dependencies.schemaPreview === true
                ? "schema_only"
                : OPERATIONAL_CATALOG_NAMES.includes(String(entry["name"]))
                  ? "operational"
                  : "schema_only",
          })),
        });
      } catch {
        return toolError(new ReadFailure("CLICKUP_INVALID_ARGUMENT"));
      }
    },
  );

  /** Schema preview is only possible through an explicitly injected in-process
   * test dependency. Production Worker does not read a preview environment flag.
   * Disabled capabilities return a clear error without network, even in preview.
   */
  if (dependencies.schemaPreview === true) {
    for (const spec of CLICKUP_MODEL_TOOL_CATALOG) {
      server.registerTool(
        spec.name,
        {
          description:
            "[SCHEMA-ONLY, NOT OPERATIONAL] " +
            spec.title +
            ": " +
            spec.purpose +
            " Example: " +
            spec.example +
            " This tool is not implemented in NeonSales. Do not call it for real ClickUp work; " +
            "ask for the approved implementation rather than claiming success.",
          inputSchema: fromJsonSchema<Record<string, unknown>>(spec.inputSchema),
          annotations: {
            readOnlyHint: spec.effect === "read",
            destructiveHint: spec.effect === "destructive",
            idempotentHint: spec.effect === "read",
          },
        },
        async () => ({
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: "CLICKUP_SCHEMA_ONLY",
                tool: spec.name,
                message:
                  "Schema registered only for model-discovery tests; no backend operation exists.",
              }),
            },
          ],
        }),
      );
    }
  }

  // Expose actual API-backed tools in production, not schema-only stubs.
  // Only the AI client controls per-tool approvals. Mutations use mcp:write,
  // the staff member's individual ClickUp OAuth token and ClickUp native history.
  if (dependencies.schemaPreview !== true) {
    const additiveWrites = new Set([
      "clickup_create_task",
      "clickup_attach_file_to_task",
      "clickup_create_bulk_tasks",
      "clickup_create_task_comment",
      "clickup_add_tag_to_task",
      "clickup_add_task_link",
      "clickup_add_dependency",
      "clickup_add_task_to_list",
      "clickup_add_time_entry",
      "clickup_create_list",
      "clickup_create_list_in_folder",
      "clickup_create_folder",
      "clickup_send_chat_message",
      "clickup_create_document",
      "clickup_create_document_page",
    ]);
    for (const spec of CLICKUP_MODEL_TOOL_CATALOG) {
      if (!OPERATIONAL_CATALOG_NAMES.includes(spec.name)) continue;
      const write = spec.effect !== "read";
      server.registerTool(
        spec.name,
        {
          description:
            "[REAL CLICKUP API] " +
            spec.title +
            ": " +
            spec.purpose +
            " The connected AI client owns its tool confirmation and trust settings. " +
            "The MCP does not add any approval dialog, audit journal or rollback engine.",
          inputSchema: fromJsonSchema<Record<string, unknown>>(spec.inputSchema),
          ...(write ? { scopeChallenge: requireScopes("mcp:read", "mcp:write") } : {}),
          annotations: {
            readOnlyHint: !write,
            destructiveHint: write && !additiveWrites.has(spec.name),
            idempotentHint: !write,
          },
        },
        async (args, extra) => {
          try {
            const grant = write
              ? await requireWriteGrant(extra.http?.authInfo, dependencies.bindings)
              : await requireReadGrant(extra.http?.authInfo, dependencies.bindings);
            return toolSuccess(
              await runCatalogOperation(spec.name, args, grant, dependencies.fetcher ?? fetch),
            );
          } catch (error) {
            return toolError(error);
          }
        },
      );
    }
  }

  const taskProperties = {
    name: {
      type: "string",
      minLength: 1,
      maxLength: 180,
      description: "Task title, not a unique identifier.",
    },
    description: {
      type: "string",
      minLength: 1,
      maxLength: 8000,
      description: "Plain-text task description; no agent signature added.",
    },
    status: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Exact status from get_scoped_list, not a guessed label.",
    },
    priority: {
      type: "integer",
      minimum: 1,
      maximum: 4,
      description: "1 urgent, 2 high, 3 normal, 4 low.",
    },
    due_date_ms: {
      type: "integer",
      minimum: 1,
      maximum: 9000000000000,
      description: "UTC Unix epoch milliseconds.",
    },
  } as const;

  server.registerTool(
    "get_scoped_list",
    {
      description:
        "Read the configured ClickUp List, statuses and current resource_scope. task_id_operations_enabled is false under legacy List-only grants because ClickUp task-ID mutations lack an atomic List boundary; changing that requires separately approved Workspace authorization.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (_args, extra) => {
      try {
        const grant = await scopedGrant(extra.http?.authInfo);
        const list = await getScopedList(grant, dependencies.fetcher ?? fetch);
        return toolSuccess({
          ...list,
          resource_scope: grant.resourceScope ?? "list",
          task_id_operations_enabled: grant.resourceScope === "workspace",
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_scoped_task",
    {
      description:
        "CREATE a real ClickUp task in the configured List using YOUR own ClickUp OAuth identity. Required scope mcp:write. This posts immediately when your AI client allows the tool; the MCP adds no extra approval or action journal. Check required Custom Fields and choose exact status first. Never retry an uncertain write blindly.",
      scopeChallenge: requireScopes("mcp:read", "mcp:write"),
      inputSchema: fromJsonSchema<TaskInput>({
        type: "object",
        properties: taskProperties,
        required: ["name"],
        additionalProperties: false,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args, extra) => {
      try {
        const grant = await scopedGrant(extra.http?.authInfo, true);
        return toolSuccess(await createScopedTask(grant, args, dependencies.fetcher ?? fetch));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  // update_scoped_task and comment_on_scoped_task are intentionally not
  // advertised: ClickUp's task-ID mutation endpoints lack an atomic home-List
  // precondition. A task could move after a read but before the write.

  // Task-ID comment reads also remain unadvertised until a List-bound
  // retrieval method can close the move-after-preflight confidentiality race.

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
        const grant = await scopedGrant(extra.http?.authInfo);
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
        "Read one task by ID, only if its verified home List matches the server-side grant.",
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
        const grant = await scopedGrant(extra.http?.authInfo);
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
        const grant = await scopedGrant(extra.http?.authInfo);
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
