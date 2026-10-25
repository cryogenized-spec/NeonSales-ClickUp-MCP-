import { fromJsonSchema } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { CLICKUP_MODEL_TOOL_CATALOG } from "../src/mcp/tool-catalog.js";
import { runCatalogOperation } from "../src/clickup/catalog-runtime.js";
import type { ReadGrant } from "../src/clickup/policy.js";

const grant: ReadGrant = {
  subject: "github:11",
  clickupUserId: "707",
  workspaceId: "555",
  listId: "12345",
  resourceScope: "workspace",
  apiToken: "synthetic",
  quota: {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
  },
};
const valid: Record<string, Record<string, unknown>> = {
  clickup_search_workspace: { query: "stock" },
  clickup_search_tasks_by_type: { task_type: "7" },
  clickup_search_tasks_by_tag: { tag: "Needs Attention" },
  clickup_create_task: { list_id: "12345", new_task: { name: "Stock" } },
  clickup_get_task: { task_id: "abc123" },
  clickup_update_task: { task_id: "abc123", changes: { status: "open" } },
  clickup_set_custom_field: {
    task_id: "abc123",
    field_id: "field1",
    field_value: { number: -28.25 },
  },
  clickup_delete_task: { task_id: "abc123" },
  clickup_create_bulk_tasks: { list_id: "12345", tasks: [{ name: "Stock" }] },
  clickup_update_bulk_tasks: { task_updates: [{ task_id: "abc123", changes: { priority: 1 } }] },
  clickup_attach_file_to_task: {
    task_id: "abc123",
    file_name: "report.txt",
    file_base64: "dGVzdA==",
  },
  clickup_get_task_comments: { task_id: "abc123" },
  clickup_get_threaded_replies: { task_id: "abc123", comment_id: "comment1" },
  clickup_create_task_comment: { task_id: "abc123", text: "Approved update" },
  clickup_add_tag_to_task: { task_id: "abc123", tag: "Needs Attention" },
  clickup_remove_tag_from_task: { task_id: "abc123", tag: "Needs Attention" },
  clickup_add_task_link: { task_id: "abc123", other_task_id: "def456" },
  clickup_remove_task_link: { task_id: "abc123", other_task_id: "def456" },
  clickup_add_dependency: { blocking_task_id: "abc123", waiting_task_id: "def456" },
  clickup_remove_dependency: { blocking_task_id: "abc123", waiting_task_id: "def456" },
  clickup_move_task_to_list: {
    task_id: "abc123",
    source_list_id: "12345",
    destination_list_id: "12346",
  },
  clickup_add_task_to_list: { task_id: "abc123", destination_list_id: "12346" },
  clickup_get_task_time_entries: { task_id: "abc123" },
  clickup_get_time_entries_for_tasks: { list_id: "12345" },
  clickup_start_time_tracking: { task_id: "abc123" },
  clickup_stop_time_tracking: {},
  clickup_add_time_entry: { task_id: "abc123", start_ms: 1792890000000, duration_ms: 60000 },
  clickup_get_current_time_entry: {},
  clickup_get_workspace_hierarchy: { workspace_id: "555" },
  clickup_create_list: { name: "Stock", space_id: "777" },
  clickup_create_list_in_folder: { name: "Stock", folder_id: "888" },
  clickup_get_list: { list_id: "12345" },
  clickup_update_list: { list_id: "12345", name: "Stock" },
  clickup_get_folder: { folder_id: "888" },
  clickup_create_folder: { space_id: "777", name: "Stock" },
  clickup_update_folder: { folder_id: "888", name: "Stock" },
  clickup_get_workspace_members: { workspace_id: "555" },
  clickup_find_member_by_name: { workspace_id: "555", email_or_name: "Gareth" },
  clickup_resolve_assignees: { workspace_id: "555", people: ["Gareth"] },
  clickup_get_chat_channels: { workspace_id: "555" },
  clickup_send_chat_message: { channel_id: "channel1", text: "Approved update" },
  clickup_create_document: { workspace_id: "555", name: "Stock" },
  clickup_list_document_pages: { document_id: "doc1" },
  clickup_get_document_pages: { document_id: "doc1", page_id: "page1" },
  clickup_create_document_page: { document_id: "doc1", name: "Stock" },
  clickup_update_document_page: {
    document_id: "doc1",
    page_id: "page1",
    doc_content: "Revised text",
  },
  clickup_get_task_time_in_status: { task_id: "abc123" },
  clickup_get_list_time_in_status: { list_id: "12345" },
};
async function issues(name: string, args: Record<string, unknown>) {
  const spec = CLICKUP_MODEL_TOOL_CATALOG.find((s) => s.name === name);
  if (!spec) throw Error("Missing catalogue schema: " + name);
  return (await fromJsonSchema(spec.inputSchema)["~standard"].validate(args)).issues;
}

describe("48-tool contract audit", () => {
  it.each(["clickup_search_tasks_by_tag", "clickup_search_tasks_by_type"])(
    "reports nested clipping in %s matches",
    async (name) => {
      const api = vi.fn(async () =>
        Response.json({
          tasks: [
            {
              id: "abc123",
              list: { id: "12345" },
              tags: [{ name: "Urgent" }],
              custom_item_id: 7,
              custom_fields: Array.from({ length: 51 }, (_, n) => ({ id: "field" + n })),
            },
          ],
        }),
      );
      const args = name === "clickup_search_tasks_by_tag" ? { tag: "Urgent" } : { task_type: "7" };
      const result = await runCatalogOperation(name, args, grant, api as typeof fetch);
      expect(result["incomplete"]).toBe(true);
    },
  );
  it("marks nested hierarchy clipping incomplete within a single Space", async () => {
    const api = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p.endsWith("/space")) return Response.json({ spaces: [{ id: "777" }] });
      if (p.endsWith("/folder")) return Response.json({ folders: [] });
      return Response.json({
        lists: Array.from({ length: 51 }, (_, n) => ({ id: String(1000 + n), name: "List " + n })),
      });
    });
    const result = await runCatalogOperation(
      "clickup_get_workspace_hierarchy",
      { workspace_id: "555" },
      grant,
      api as typeof fetch,
    );
    expect(result["incomplete"]).toBe(true);
    const spaces = result["spaces"] as Array<{ lists: unknown[] }>;
    expect(spaces[0]?.lists).toHaveLength(50);
  });

  it("reports nested clipping in a task response instead of claiming completeness", async () => {
    const api = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p.endsWith("/space")) return Response.json({ spaces: [{ id: "777" }] });
      if (p.includes("/list/")) return Response.json({ id: "12345", space: { id: "777" } });
      return Response.json({
        id: "abc123",
        list: { id: "12345" },
        custom_fields: Array.from({ length: 51 }, (_, n) => ({ id: "field" + n })),
      });
    });
    const result = await runCatalogOperation(
      "clickup_get_task",
      { task_id: "abc123" },
      grant,
      api as typeof fetch,
    );
    expect(result["incomplete"]).toBe(true);
    expect(result["custom_fields"]).toHaveLength(50);
  });
  it("uses ClickUp's numeric Folder parent type when creating a Doc", async () => {
    const api = vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ id: "doc1" });
      return Response.json(
        new URL(String(req)).pathname.endsWith("/space")
          ? { spaces: [{ id: "777" }] }
          : { id: "888", space: { id: "777" } },
      );
    });
    await runCatalogOperation(
      "clickup_create_document",
      { workspace_id: "555", name: "Stock", folder_id: "888" },
      grant,
      api as typeof fetch,
    );
    expect(
      JSON.parse(String(api.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body)),
    ).toEqual({ name: "Stock", create_page: true, parent: { id: "888", type: 5 } });
  });

  it("reports a Chat next_cursor even when fewer than max_results arrive", async () => {
    const api = vi.fn(async () =>
      Response.json({ data: [{ id: "channel1" }], next_cursor: "next-page" }),
    );
    const result = await runCatalogOperation(
      "clickup_get_chat_channels",
      { workspace_id: "555", max_results: 20 },
      grant,
      api as typeof fetch,
    );
    expect(result).toMatchObject({
      data: [{ id: "channel1" }],
      incomplete: true,
      next_cursor: "next-page",
    });
  });

  it("reports capped Workspace member results", async () => {
    const api = vi.fn(async () =>
      Response.json({
        teams: [
          {
            id: "555",
            members: [
              { user: { id: 707, username: "One" } },
              { user: { id: 708, username: "Two" } },
            ],
          },
        ],
      }),
    );
    const result = await runCatalogOperation(
      "clickup_get_workspace_members",
      { workspace_id: "555", max_results: 1 },
      grant,
      api as typeof fetch,
    );
    expect(result).toMatchObject({ members: [{ id: 707 }], incomplete: true });
  });

  it("does not hide ambiguous assignees beyond the first 200 members", async () => {
    const members = Array.from({ length: 201 }, (_, n) => ({
      user: { id: n + 1, username: n === 0 || n === 200 ? "Gareth" : "Other" },
    }));
    const api = vi.fn(async () => Response.json({ teams: [{ id: "555", members }] }));
    const result = await runCatalogOperation(
      "clickup_resolve_assignees",
      { workspace_id: "555", people: ["Gareth"] },
      grant,
      api as typeof fetch,
    );
    expect(result).toMatchObject({
      results: [{ ambiguous: true, matches: [{ id: 1 }, { id: 201 }] }],
    });
  });

  it("fails closed on malformed List time-in-status enumeration", async () => {
    const api = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p.endsWith("/space")) return Response.json({ spaces: [{ id: "777" }] });
      if (p.endsWith("/task")) return Response.json({ unrelated: [] });
      return Response.json({ id: "12345", space: { id: "777" } });
    });
    await expect(
      runCatalogOperation(
        "clickup_get_list_time_in_status",
        { list_id: "12345" },
        grant,
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_BAD_RESPONSE");
  });
  it("accepts ClickUp's documented top-level Doc page-list array", async () => {
    const api = vi.fn(async () =>
      Response.json([
        { id: "8cht190-271", doc_id: "8cht190-831", workspace_id: 555, name: "Stock" },
      ]),
    );
    const result = await runCatalogOperation(
      "clickup_list_document_pages",
      { document_id: "8cht190-831" },
      grant,
      api as typeof fetch,
    );
    expect(result).toMatchObject({
      pages: [{ id: "8cht190-271" }],
      incomplete: true,
      max_page_depth: 4,
    });
  });

  it("marks capped search matches incomplete even below a full upstream page", async () => {
    const api = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p.endsWith("/task"))
        return Response.json({
          tasks: [1, 2, 3].map((n) => ({ id: "task" + n, name: "Stock", list: { id: "12345" } })),
        });
      if (p.endsWith("/docs")) return Response.json({ docs: [] });
      if (p.endsWith("/space")) return Response.json({ spaces: [] });
      throw Error("Unexpected route");
    });
    const result = await runCatalogOperation(
      "clickup_search_workspace",
      { query: "stock", max_results: 1 },
      grant,
      api as typeof fetch,
    );
    expect(result["tasks"]).toHaveLength(1);
    expect(result["incomplete"]).toBe(true);
  });

  it("does not mistake an empty task-creation response for a confirmed write", async () => {
    const api = vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({});
      return Response.json(
        new URL(String(req)).pathname.endsWith("/space")
          ? { spaces: [{ id: "777" }] }
          : { id: "12345", space: { id: "777" } },
      );
    });
    await expect(
      runCatalogOperation(
        "clickup_create_task",
        valid["clickup_create_task"]!,
        grant,
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_WRITE_OUTCOME_UNKNOWN");
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("keeps explicit Custom Field date times in the upstream payload", async () => {
    const api = vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({});
      const p = new URL(String(req)).pathname;
      if (p.endsWith("/space")) return Response.json({ spaces: [{ id: "777" }] });
      if (p.includes("/list/")) return Response.json({ id: "12345", space: { id: "777" } });
      return Response.json({ id: "abc123", list: { id: "12345" } });
    });
    await runCatalogOperation(
      "clickup_set_custom_field",
      { task_id: "abc123", field_id: "field1", field_value: { timestamp_ms: 1792890000000 } },
      grant,
      api as typeof fetch,
    );
    expect(
      JSON.parse(String(api.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body)),
    ).toEqual({ value: 1792890000000, value_options: { time: true } });
  });
  it.each(Object.entries(valid))(
    "validates a realistic %s request and rejects undeclared authority",
    async (name, args) => {
      expect(await issues(name, args)).toBeUndefined();
      expect(await issues(name, { ...args, api_token: "injected" })).toBeDefined();
    },
  );

  const invalid: Array<[string, Record<string, unknown>]> = [
    ["clickup_create_list", { name: "No parent" }],
    ["clickup_create_list", { name: "Two parents", folder_id: "888", space_id: "777" }],
    ["clickup_update_task", { task_id: "abc123", changes: {} }],
    ["clickup_update_bulk_tasks", { task_updates: [{ task_id: "abc123", changes: {} }] }],
    ["clickup_create_bulk_tasks", { list_id: "12345", tasks: [] }],
    ["clickup_update_bulk_tasks", { task_updates: [] }],
    ["clickup_resolve_assignees", { workspace_id: "555", people: [] }],
    ["clickup_get_task", { task_id: "../../secret" }],
    ["clickup_get_document_pages", { document_id: "doc1", page_id: "bad/page" }],
    ["clickup_get_list", { list_id: "not-a-list-id" }],
    ["clickup_create_task", { list_id: "12345", new_task: { name: "   " } }],
    [
      "clickup_create_task",
      { list_id: "12345", new_task: { name: "Stock", assignee_ids: ["Gareth"] } },
    ],
    [
      "clickup_create_task",
      { list_id: "12345", new_task: { name: "Stock", assignee_ids: ["9007199254740993"] } },
    ],
    ["clickup_set_custom_field", { task_id: "abc123", field_id: "field1", field_value: {} }],
    [
      "clickup_set_custom_field",
      { task_id: "abc123", field_id: "field1", field_value: { text: "wrong", checked: false } },
    ],
    ["clickup_search_workspace", { query: "x".repeat(161) }],
  ];
  it.each(invalid)("rejects invalid %s arguments before dispatch: %j", async (name, args) => {
    expect(await issues(name, args)).toBeDefined();
  });

  it("preserves false checkbox and empty label-selection values", async () => {
    for (const field_value of [{ checked: false }, { selected_option_ids: [] }]) {
      expect(
        await issues("clickup_set_custom_field", {
          task_id: "abc123",
          field_id: "field1",
          field_value,
        }),
      ).toBeUndefined();
    }
  });

  it.each([
    "clickup_get_workspace_hierarchy",
    "clickup_create_list",
    "clickup_create_list_in_folder",
    "clickup_get_folder",
    "clickup_create_folder",
    "clickup_update_folder",
    "clickup_get_workspace_members",
    "clickup_find_member_by_name",
    "clickup_resolve_assignees",
    "clickup_get_chat_channels",
    "clickup_send_chat_message",
    "clickup_create_document",
    "clickup_list_document_pages",
    "clickup_get_document_pages",
    "clickup_create_document_page",
    "clickup_update_document_page",
  ])("denies %s outside a single-List grant before HTTP", async (name) => {
    const api = vi.fn(async () =>
      Response.json({ spaces: [{ id: "777" }], id: "888", space: { id: "777" } }),
    );
    await expect(
      runCatalogOperation(
        name,
        valid[name]!,
        { ...grant, resourceScope: "list" },
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_WORKSPACE_SCOPE_REQUIRED");
    expect(api).not.toHaveBeenCalled();
  });

  it("never scans Workspace Docs or hierarchy during single-List text search", async () => {
    const api = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p === "/api/v2/list/12345") return Response.json({ id: "12345", space: { id: "777" } });
      if (p === "/api/v2/team/555/space") return Response.json({ spaces: [{ id: "777" }] });
      if (p === "/api/v2/list/12345/task")
        return Response.json({ tasks: [{ id: "abc123", list: { id: "12345" }, name: "Stock" }] });
      throw Error("Unexpected broad read: " + p);
    });
    const result = await runCatalogOperation(
      "clickup_search_workspace",
      { query: "stock" },
      { ...grant, resourceScope: "list" },
      api as typeof fetch,
    );
    expect(result).toMatchObject({
      tasks: [{ id: "abc123" }],
      docs: [],
      lists: [],
      folders: [],
      search_scope: "list",
    });
    expect(api.mock.calls.map(([req]) => new URL(String(req)).pathname)).toEqual([
      "/api/v2/list/12345",
      "/api/v2/team/555/space",
      "/api/v2/list/12345/task",
    ]);
  });

  it.each([
    "clickup_add_tag_to_task",
    "clickup_add_dependency",
    "clickup_add_task_to_list",
    "clickup_set_custom_field",
  ])(
    "accepts a documented empty JSON acknowledgement for %s without claiming read-back",
    async (name) => {
      const api = vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") return Response.json({});
        const p = new URL(String(req)).pathname;
        if (p.endsWith("/space")) return Response.json({ spaces: [{ id: "777" }] });
        if (p.includes("/list/")) return Response.json({ id: "12346", space: { id: "777" } });
        return Response.json({ id: p.split("/").at(-1), list: { id: "12346" } });
      });
      expect(
        await runCatalogOperation(name, valid[name]!, grant, api as typeof fetch),
      ).toMatchObject({ accepted: true, read_back_verified: false });
      expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    },
  );

  it("caps documented time-entry data arrays and reports omitted records", async () => {
    const api = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p.endsWith("/space")) return Response.json({ spaces: [{ id: "777" }] });
      if (p.includes("/list/")) return Response.json({ id: "12345", space: { id: "777" } });
      return Response.json({ data: [{ id: "entry1" }, { id: "entry2" }, { id: "entry3" }] });
    });
    const result = await runCatalogOperation(
      "clickup_get_time_entries_for_tasks",
      { list_id: "12345", max_results: 2 },
      grant,
      api as typeof fetch,
    );
    expect(result).toMatchObject({ data: [{ id: "entry1" }, { id: "entry2" }], incomplete: true });
  });
});
