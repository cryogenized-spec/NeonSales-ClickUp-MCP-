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
  it("registers 47 distinct REST backed capability names; binary attachment is not disguised as working", () => {
    expect(OPERATIONAL_CATALOG_NAMES).toHaveLength(47);
    expect(new Set(OPERATIONAL_CATALOG_NAMES).size).toBe(47);
    expect(
      OPERATIONAL_CATALOG_NAMES.every((n) => CLICKUP_MODEL_TOOL_CATALOG.some((s) => s.name === n)),
    ).toBe(true);
    expect(OPERATIONAL_CATALOG_NAMES).not.toContain("clickup_attach_file_to_task");
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
      calls.every(([, i]) => (i?.headers as Record<string, string>)["Authorization"] === "person-707"),
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
    const f = vi.fn(async (_req: RequestInfo | URL, _init?: RequestInit) => reply({ id: "message-1" }));
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
});
