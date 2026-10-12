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
  it("registers all 48 REST backed capability names including a bounded binary attachment implementation", () => {
    expect(OPERATIONAL_CATALOG_NAMES).toHaveLength(48);
    expect(new Set(OPERATIONAL_CATALOG_NAMES).size).toBe(48);
    expect(
      OPERATIONAL_CATALOG_NAMES.every((n) => CLICKUP_MODEL_TOOL_CATALOG.some((s) => s.name === n)),
    ).toBe(true);
    expect(OPERATIONAL_CATALOG_NAMES).toContain("clickup_attach_file_to_task");
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
    expect(api).toHaveBeenCalledTimes(2);
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
  it("sends actual provided file bytes as multipart to ClickUp, never fetches a file URL", async () => {
    let sent: FormData | null = null;
    const f = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(request));
      if (init?.method === "POST") {
        expect(u.href).toBe("https://api.clickup.com/api/v2/task/abc123/attachment");
        expect((init.headers as Record<string, string>)["Authorization"]).toBe("person-707");
        expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
        sent = init.body as FormData;
        return reply({ id: "attachment-1" });
      }
      return reply(fixture(u.pathname));
    });
    const output = await runCatalogOperation(
      "clickup_attach_file_to_task",
      {
        task_id: "abc123",
        file_name: "note.txt",
        file_base64: btoa("hello"),
        media_type: "text/plain",
      },
      makeGrant(),
      f as typeof fetch,
    );
    expect(output).toMatchObject({ id: "attachment-1" });
    expect(sent).not.toBeNull();
    const blob = sent!.get("attachment[0]") as File;
    expect(blob.name).toBe("note.txt");
    expect(await blob.text()).toBe("hello");
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("refuses oversized, malformed or path-style attachment input before any upload", async () => {
    const outbound = fakeApi();
    for (const [file_name, file_base64] of [
      ["../bad.txt", btoa("hello")],
      ["good.txt", "not valid==="],
      ["good.txt", "Z".repeat(700100)],
    ]) {
      await expect(
        runCatalogOperation(
          "clickup_attach_file_to_task",
          { task_id: "abc123", file_name, file_base64 },
          makeGrant(),
          outbound as typeof fetch,
        ),
      ).rejects.toThrow("CLICKUP_INVALID_ARGUMENT");
    }
    expect(outbound.mock.calls.every(([, opts]) => opts?.method !== "POST")).toBe(true);
  });
  it("encodes multiword ClickUp tag names without accepting path injection", async () => {
    const f=vi.fn(async (req:RequestInfo|URL, init?:RequestInit) => reply(fixture(new URL(String(req)).pathname)));
    await runCatalogOperation("clickup_add_tag_to_task",{task_id:"abc123",tag:"Needs Attention"},makeGrant(),f as typeof fetch);
    const writes=f.mock.calls.filter(([,init])=>init?.method==="POST");
    expect(writes).toHaveLength(1);
    expect(String(writes[0]?.[0])).toContain("/tag/Needs%20Attention");
  });

  it("rejects a move when the task's current home List does not equal source_list_id", async () => {
    const f=fakeApi();
    await expect(runCatalogOperation(
      "clickup_move_task_to_list",
      {task_id:"abc123",source_list_id:"99999",destination_list_id:"12345"},makeGrant(),f as typeof fetch,
    )).rejects.toThrow("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
    expect(f.mock.calls.every(([,init])=>init?.method!=="PUT")).toBe(true);
  });

  it("uses query parameters for deletion of dependencies rather than a DELETE JSON body", async () => {
    const f=vi.fn(async (req: RequestInfo|URL, init?:RequestInit) => {
      const path=new URL(String(req)).pathname;
      if(path==="/api/v2/task/block123") return reply({id:"block123",list:{id:"12345"}});
      if(path==="/api/v2/task/wait123") return reply({id:"wait123",list:{id:"12345"}});
      return reply(fixture(path));
    });
    await runCatalogOperation("clickup_remove_dependency",{
      blocking_task_id:"block123",waiting_task_id:"wait123",
    },makeGrant(),f as typeof fetch);
    const deletion=f.mock.calls.find(([,init])=>init?.method==="DELETE");
    expect(String(deletion?.[0])).toBe("https://api.clickup.com/api/v2/task/wait123/dependency?depends_on=block123");
    expect(deletion?.[1]?.body).toBeUndefined();
  });

});
