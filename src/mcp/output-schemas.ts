/** Exact, reusable JSON Schema contracts for the operational read-only tools. */
export const SCOPED_TASK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Verified ClickUp task ID" },
    name: { type: "string", description: "Task title, truncated to 180 characters" },
    status: { type: "string", description: "ClickUp List status" },
    list_id: { type: "string", description: "Verified task home List, not input authority" },
    due_date_ms: {
      type: ["integer", "null"],
      description: "UTC Unix milliseconds; null if not assigned",
    },
    date_updated_ms: {
      type: ["integer", "null"],
      description: "UTC Unix milliseconds of last task metadata update, not staff activity proof",
    },
    assignee_ids: { type: "array", items: { type: "string" }, maxItems: 12 },
    url: { type: ["string", "null"], description: "Validated ClickUp task URL or null" },
  },
  required: [
    "id",
    "name",
    "status",
    "list_id",
    "due_date_ms",
    "date_updated_ms",
    "assignee_ids",
    "url",
  ],
  additionalProperties: false,
} as const;

export const FIND_TASKS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string", const: "clickup-api-v2" },
    list_id: { type: "string" },
    tasks: { type: "array", items: SCOPED_TASK_OUTPUT_SCHEMA, maxItems: 50 },
    pages_scanned: { type: "integer", minimum: 0, maximum: 3 },
    incomplete: {
      type: "boolean",
      description: "True when page/output limits prevent an exhaustive result.",
    },
  },
  required: ["source", "list_id", "tasks", "pages_scanned", "incomplete"],
  additionalProperties: false,
} as const;

export const GET_TASK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string", const: "clickup-api-v2" },
    ...SCOPED_TASK_OUTPUT_SCHEMA.properties,
  },
  required: ["source", ...SCOPED_TASK_OUTPUT_SCHEMA.required],
  additionalProperties: false,
} as const;

export const ATTENTION_REPORT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string", const: "clickup-api-v2" },
    list_id: { type: "string" },
    evaluated_at_utc: { type: "string", description: "ISO8601 UTC timestamp of evaluation" },
    evaluated_at_sast: { type: "string", description: "ISO8601 Africa/Johannesburg +02:00" },
    lookahead_hours: { type: "integer", minimum: 1, maximum: 48 },
    pages_scanned: { type: "integer", minimum: 0, maximum: 3 },
    incomplete: {
      type: "boolean",
      description: "True if capped. Never describe a partial report as comprehensive.",
    },
    overdue: { type: "array", items: SCOPED_TASK_OUTPUT_SCHEMA, maxItems: 50 },
    due_soon: { type: "array", items: SCOPED_TASK_OUTPUT_SCHEMA, maxItems: 50 },
    not_updated_for_48h: { type: "array", items: SCOPED_TASK_OUTPUT_SCHEMA, maxItems: 50 },
  },
  required: [
    "source",
    "list_id",
    "evaluated_at_utc",
    "evaluated_at_sast",
    "lookahead_hours",
    "pages_scanned",
    "incomplete",
    "overdue",
    "due_soon",
    "not_updated_for_48h",
  ],
  additionalProperties: false,
} as const;

export const SERVICE_INFO_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    phase: { type: "integer", const: 3 },
    liveClickUp: { type: "boolean", const: false },
    authentication: { type: "string", const: "github-oauth-required" },
    note: { type: "string" },
  },
  required: ["phase", "liveClickUp", "authentication", "note"],
  additionalProperties: false,
} as const;

export const TOOL_CATALOG_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string", const: "neonsales-clickup-mcp" },
    version: { type: "integer", const: 1 },
    status: { type: "string", const: "schema-only-for-planned-operations" },
    implemented: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          behavior: { type: "string" },
          permission: { type: "string" },
        },
        required: ["name", "behavior", "permission"],
        additionalProperties: false,
      },
    },
    planned: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          title: { type: "string" },
          operation: { type: "string", enum: ["read", "write", "destructive"] },
          status: { type: "string", const: "not-implemented" },
        },
        required: ["name", "category", "title", "operation", "status"],
        additionalProperties: false,
      },
    },
    policy: { type: "string" },
  },
  required: ["source", "version", "status", "implemented", "planned", "policy"],
  additionalProperties: false,
} as const;
