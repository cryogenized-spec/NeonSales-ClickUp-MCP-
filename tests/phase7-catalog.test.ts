import { describe, expect, it, vi } from "vitest";
import { OPERATIONAL_CATALOG_NAMES, runCatalogOperation } from "../src/clickup/catalog-runtime.js";
import type { ReadGrant } from "../src/clickup/policy.js";
import { CLICKUP_MODEL_TOOL_CATALOG } from "../src/mcp/tool-catalog.js";

const makeGrant = (
  subject = "github:11",
  clickupUserId = "707",
  apiToken = "person-707",
): ReadGrant => ({
  subject,
  clickupUserId,
  workspaceId: "555",
  listId: "12345",
  apiToken,
  quota: {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
  },
});
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Content-Type": "application/json" } });
const fixture = (path: string) => {
  if (path === "/api/v2/list/12345") return { id: "12345", space: { id: "777" } };
  if (path === "/api/v2/list/99999") return { id: "99999", space: { id: "888" } };
  if (path === "/api/v2/list/12346") return { id: "12346", space: { id: "777" } };
  if (path === "/api/v2/team/555/space") return { spaces: [{ id: "777", name: "NeonSales" }] };
  if (path === "/api/v2/task/abc123") return { id: "abc123", list: { id: "12345" }, name: "Order" };
  return { id: "new123", name: "Test" };
};
const fakeApi = () =>
  vi.fn(async (req: RequestInfo | URL, _init?: RequestInit) => {
    const u = new URL(String(req));
    if (u.host !== "api.clickup.com") throw Error("wrong host");
    const p = u.pathname;
    return reply(fixture(p), 200);
  });

describe("Phase 7 individual OAuth and native catalogue - adversarial tests", () => {
  it("advertises only the reviewed 26 operational entries, not task-ID mutations", () => {
    expect(CLICKUP_MODEL_TOOL_CATALOG).toHaveLength(48);
    expect(OPERATIONAL_CATALOG_NAMES).toHaveLength(26);
    expect(new Set(OPERATIONAL_CATALOG_NAMES).size).toBe(26);
    expect(
      OPERATIONAL_CATALOG_NAMES.every((n) => CLICKUP_MODEL_TOOL_CATALOG.some((s) => s.name === n)),
    ).toBe(true);
    expect(OPERATIONAL_CATALOG_NAMES).toContain("clickup_create_task");
    expect(OPERATIONAL_CATALOG_NAMES).not.toContain("clickup_update_task");
    expect(OPERATIONAL_CATALOG_NAMES).not.toContain("clickup_move_task_to_list");
  });

  it("creates a task in a verified Workspace List using solely the connected employee OAuth token", async () => {
    const fetched = fakeApi();
    const response = await runCatalogOperation(
      "clickup_create_task",
      { list_id: "12345", new_task: { name: "Sales request" } },
      makeGrant(),
      fetched as typeof fetch,
    );
    expect(response).toMatchObject({ id: "new123" });
    expect(fetched).toHaveBeenCalledTimes(3);
    const calls = fetched.mock.calls;
    expect(calls.map(([r]) => new URL(String(r)).pathname)).toEqual([
      "/api/v2/list/12345",
      "/api/v2/team/555/space",
      "/api/v2/list/12345/task",
    ]);
    expect(
      calls.every(
        ([, i]) => (i?.headers as Record<string, string>)["Authorization"] === "person-707",
      ),
    ).toBe(true);
    expect(calls[2]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(calls[2]?.[1]?.body))).toMatchObject({ name: "Sales request" });
  });

  it("refuses cross-workspace List configuration before a write reaches ClickUp", async () => {
    const api = fakeApi();
    await expect(
      runCatalogOperation(
        "clickup_create_task",
        { list_id: "99999", new_task: { name: "Bad target" } },
        makeGrant(),
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
    expect(api.mock.calls.every(([, i]) => i?.method === "GET")).toBe(true);
    // The configured List grant denies mismatched IDs BEFORE a network call.
    expect(api).not.toHaveBeenCalled();
  });

  it("denies a different List even when it belongs to the same ClickUp Workspace", async () => {
    const api = fakeApi();
    await expect(
      runCatalogOperation(
        "clickup_create_task",
        {
          list_id: "12346",
          new_task: { name: "Not this List" },
        },
        makeGrant(),
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
    expect(api).not.toHaveBeenCalled();
    await expect(
      runCatalogOperation(
        "clickup_get_list",
        { list_id: "12346" },
        makeGrant(),
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
    expect(api).not.toHaveBeenCalled();
  });

  it("validates ALL bulk task drafts before writing, even if the second draft is invalid", async () => {
    const api = fakeApi();
    await expect(
      runCatalogOperation(
        "clickup_create_bulk_tasks",
        { list_id: "12345", tasks: [{ name: "Valid first" }, { name: "   " }] },
        makeGrant(),
        api as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_INVALID_ARGUMENT");
    expect(api.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("keeps credentials separate across employees in parallel, never a shared API token", async () => {
    const seen: string[] = [];
    const f = vi.fn(async (req: RequestInfo | URL, opts?: RequestInit) => {
      seen.push((opts?.headers as Record<string, string>)["Authorization"] ?? "");
      return reply({ channels: [] });
    });
    await Promise.all([
      runCatalogOperation(
        "clickup_get_chat_channels",
        { workspace_id: "555" },
        makeGrant(),
        f as typeof fetch,
      ),
      runCatalogOperation(
        "clickup_get_chat_channels",
        { workspace_id: "555" },
        makeGrant("github:22", "809", "person-809"),
        f as typeof fetch,
      ),
    ]);
    expect(seen.sort()).toEqual(["person-707", "person-809"]);
  });

  it("never accesses a model-selected foreign workspace even with a valid credential", async () => {
    const outbound = vi.fn(async () => reply({ channels: [] }));
    await expect(
      runCatalogOperation(
        "clickup_get_chat_channels",
        { workspace_id: "666" },
        makeGrant(),
        outbound as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
    expect(outbound).not.toHaveBeenCalled();
  });

  it("blocks arbitrary URL/path injection before contacting ClickUp", async () => {
    const outbound = fakeApi();
    for (const task_id of ["../../evil", "https://evil.invalid", "?token=steal"]) {
      await expect(
        runCatalogOperation("clickup_get_task", { task_id }, makeGrant(), outbound as typeof fetch),
      ).rejects.toThrow("CLICKUP_INVALID_ARGUMENT");
    }
    expect(outbound).not.toHaveBeenCalled();
  });

  it("never automatically retries an ambiguous upstream write", async () => {
    const records: string[] = [];
    const f = vi.fn(async (req: RequestInfo | URL, opts?: RequestInit) => {
      const url = new URL(String(req));
      records.push(opts?.method + " " + url.pathname);
      if (opts?.method === "POST") throw Error("synthetic dropped response after ClickUp commit");
      return reply(fixture(url.pathname));
    });
    await expect(
      runCatalogOperation(
        "clickup_create_task",
        { list_id: "12345", new_task: { name: "Potential duplicate" } },
        makeGrant(),
        f as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_WRITE_OUTCOME_UNKNOWN");
    expect(records.filter((x) => x.startsWith("POST"))).toHaveLength(1);
  });

  it("does not leak arbitrary upstream fields indicating secret tokens", async () => {
    const f = vi.fn(async () =>
      reply({ channels: [{ id: "c1", access_token: "never-return" }], secret: "never-return" }),
    );
    const result = await runCatalogOperation(
      "clickup_get_chat_channels",
      {},
      makeGrant(),
      f as typeof fetch,
    );
    expect(JSON.stringify(result)).not.toContain("never-return");
  });

  it("uses a real v3 ClickUp Chat API message endpoint with the employee token", async () => {
    const f = vi.fn(async (_req: RequestInfo | URL, _init?: RequestInit) =>
      reply({ id: "message-1" }),
    );
    const result = await runCatalogOperation(
      "clickup_send_chat_message",
      { channel_id: "chan-123", text: "Test dispatch status" },
      makeGrant(),
      f as typeof fetch,
    );
    expect(result).toMatchObject({ id: "message-1" });
    const [url, options] = f.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.clickup.com/api/v3/workspaces/555/chat/channels/chan-123/messages",
    );
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual({
      type: "message",
      content: "Test dispatch status",
    });
  });

  it("reports HTTP 429 without further retries and does not make the write falsely successful", async () => {
    const f = vi.fn(async () => reply({ error: "rate limit" }, 429));
    await expect(
      runCatalogOperation(
        "clickup_send_chat_message",
        { channel_id: "chan-123", text: "Test" },
        makeGrant(),
        f as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_RATE_LIMITED");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("treats ambiguous 204 and empty-200 task creations as unknown writes", async () => {
    for (const response of [new Response(null, { status: 204 }), reply({})]) {
      const f = vi.fn(async (req: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST" ? response : reply(fixture(new URL(String(req)).pathname)),
      );
      await expect(
        runCatalogOperation(
          "clickup_create_task",
          { list_id: "12345", new_task: { name: "Possible duplicate" } },
          makeGrant(),
          f as typeof fetch,
        ),
      ).rejects.toThrow("CLICKUP_WRITE_OUTCOME_UNKNOWN");
      expect(f.mock.calls.filter(([, opts]) => opts?.method === "POST")).toHaveLength(1);
    }
  });

  it("rejects malformed List task and Workspace Docs responses", async () => {
    for (const malformed of ["tasks", "docs"]) {
      const f = vi.fn(async (req: RequestInfo | URL) => {
        const p = new URL(String(req)).pathname;
        if (p === "/api/v2/list/12345") return reply(fixture(p));
        if (p === "/api/v2/team/555/space") return reply(fixture(p));
        if (p === "/api/v2/list/12345/task")
          return reply(malformed === "tasks" ? {} : { tasks: [] });
        if (p === "/api/v3/workspaces/555/docs")
          return reply(malformed === "docs" ? {} : { docs: [] });
        return reply({ folders: [], lists: [] });
      });
      await expect(
        runCatalogOperation(
          "clickup_search_workspace",
          { query: "Stocktake" },
          makeGrant(),
          f as typeof fetch,
        ),
      ).rejects.toThrow("CLICKUP_BAD_RESPONSE");
    }
  });

  it("never searches the full Workspace task collection and rejects foreign home-List tasks", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (req: RequestInfo | URL) => {
      const u = new URL(String(req));
      urls.push(u.pathname);
      if (u.pathname === "/api/v2/list/12345/task")
        return reply({ tasks: [{ id: "wrong", name: "Sensitive", list: { id: "12346" } }] });
      if (u.pathname === "/api/v2/list/12345") return reply(fixture(u.pathname));
      if (u.pathname === "/api/v2/team/555/space") return reply(fixture(u.pathname));
      throw Error("unexpected request");
    });
    await expect(
      runCatalogOperation(
        "clickup_search_workspace",
        { query: "Sensitive" },
        makeGrant(),
        f as typeof fetch,
      ),
    ).rejects.toThrow("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
    expect(urls).not.toContain("/api/v2/team/555/task");
    expect(urls).not.toContain("/api/v3/workspaces/555/docs");
  });

  it("fails closed for every deferred task-ID operation before any network call", async () => {
    const deferred = [
      "clickup_update_task",
      "clickup_set_custom_field",
      "clickup_delete_task",
      "clickup_attach_file_to_task",
      "clickup_update_bulk_tasks",
      "clickup_get_task_comments",
      "clickup_get_threaded_replies",
      "clickup_create_task_comment",
      "clickup_add_tag_to_task",
      "clickup_remove_tag_from_task",
      "clickup_add_task_link",
      "clickup_remove_task_link",
      "clickup_add_dependency",
      "clickup_remove_dependency",
      "clickup_move_task_to_list",
      "clickup_add_task_to_list",
      "clickup_get_task_time_entries",
      "clickup_start_time_tracking",
      "clickup_stop_time_tracking",
      "clickup_add_time_entry",
      "clickup_get_current_time_entry",
      "clickup_get_task_time_in_status",
    ];
    const outbound = fakeApi();
    expect(deferred).toHaveLength(22);
    for (const name of deferred) {
      expect(OPERATIONAL_CATALOG_NAMES).not.toContain(name);
      await expect(
        runCatalogOperation(name, {}, makeGrant(), outbound as typeof fetch),
      ).rejects.toThrow("CLICKUP_TOOL_NOT_IMPLEMENTED");
    }
    expect(outbound).not.toHaveBeenCalled();
  });

  it("returns matching Workspace Folders and Lists, including folder children", async () => {
    const f = vi.fn(async (req: RequestInfo | URL) => {
      const p = new URL(String(req)).pathname;
      if (p === "/api/v2/list/12345") return reply(fixture(p));
      if (p === "/api/v2/list/12345/task") return reply({ tasks: [] });
      if (p === "/api/v3/workspaces/555/docs") return reply({ docs: [] });
      if (p === "/api/v2/team/555/space") return reply({ spaces: [{ id: "777", name: "Sales" }] });
      if (p === "/api/v2/space/777/folder")
        return reply({ folders: [{ id: "f1", name: "Stocktake Folder" }] });
      if (p === "/api/v2/space/777/list")
        return reply({ lists: [{ id: "l1", name: "Stocktake List" }] });
      if (p === "/api/v2/folder/f1/list")
        return reply({ lists: [{ id: "l2", name: "Stocktake Extra List" }] });
      throw Error("unexpected mocked path " + p);
    });
    const output = await runCatalogOperation(
      "clickup_search_workspace",
      { query: "Stocktake" },
      makeGrant(),
      f as typeof fetch,
    );
    expect(output["lists"]).toHaveLength(2);
    expect(output["folders"]).toHaveLength(1);
    expect(output["incomplete"]).toBe(false);
  });
});
