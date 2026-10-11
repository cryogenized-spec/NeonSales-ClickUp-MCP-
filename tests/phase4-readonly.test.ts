import { describe, expect, it, vi } from "vitest";
import { requireReadGrant, ReadFailure, type ReadGrant } from "../src/clickup/policy.js";
import { findScopedTasks, getScopedTask } from "../src/clickup/client.js";
import { createAttentionReport } from "../src/reports/attention.js";

const env = {
  CLICKUP_LIVE_ENABLED: "true",
  CLICKUP_LIST_ID: "12345",
  CLICKUP_API_TOKEN: "synthetic-nonworking-fixture",
  CLICKUP_READ_GITHUB_IDS: "11,22",
  ALLOWED_GITHUB_IDS: "11,22,33",
  CLICKUP_QUOTA: {
    idFromName: (_name: string) => "test-quota-id",
    get: (_id: unknown) => ({
      fetch: async (_req: Request) => Response.json({ allowed: true }),
    }),
  },
};

const auth = { scopes: ["mcp:read"], extra: { subject: "github:11" } };

function task(id: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    name: "fixture " + id,
    status: { status: "to do" },
    list: { id: "12345" },
    date_updated: "1760000000000",
    due_date: null,
    assignees: [],
    url: "https://app.clickup.com/t/" + id,
    ...extras,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Phase 4 separate authorization policy", () => {
  it("accepts only approved verified subject and configured server List", () => {
    const grant = requireReadGrant(auth, env);
    expect(grant.subject).toBe("github:11");
    expect(grant.listId).toBe("12345");
  });

  it.each([
    [{ scopes: ["mcp:read"], extra: { subject: "github:33" } }, "CLICKUP_ACCESS_DENIED"],
    [{ scopes: ["mcp:read"], extra: { subject: "github:1" } }, "CLICKUP_ACCESS_DENIED"],
    [{ scopes: ["mcp:write"], extra: { subject: "github:11" } }, "CLICKUP_ACCESS_DENIED"],
    [
      { scopes: ["mcp:read", "mcp:read"], extra: { subject: "github:11" } },
      "CLICKUP_ACCESS_DENIED",
    ],
    [{ scopes: ["mcp:read"], extra: { subject: "github:011" } }, "CLICKUP_ACCESS_DENIED"],
    [null, "CLICKUP_ACCESS_DENIED"],
  ])("denies forged, out-of-grant or unexpected scopes", (identity, code) => {
    expect(() => requireReadGrant(identity, env)).toThrowError(code);
  });

  it("fails closed if any separate configuration or the quota binding is absent", () => {
    for (const field of [
      "CLICKUP_API_TOKEN",
      "CLICKUP_LIST_ID",
      "CLICKUP_QUOTA",
      "CLICKUP_READ_GITHUB_IDS",
    ]) {
      const broken: Record<string, unknown> = { ...env };
      delete broken[field];
      expect(() => requireReadGrant(auth, broken)).toThrowError("CLICKUP_NOT_CONFIGURED");
    }
    expect(() => requireReadGrant(auth, { ...env, CLICKUP_LIVE_ENABLED: "false" })).toThrowError(
      "CLICKUP_NOT_CONFIGURED",
    );
    expect(() => requireReadGrant(auth, { ...env, CLICKUP_READ_GITHUB_IDS: "11,99" })).toThrowError(
      "CLICKUP_NOT_CONFIGURED",
    );
  });
});

describe("Phase 4 ClickUp GET-only transport", () => {
  const grant = requireReadGrant(auth, env);

  it("uses exact allowed host, GET, hardcoded List and no redirects", async () => {
    const outbound = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ tasks: [task("abc123")] }),
    );
    const result = await findScopedTasks(grant, outbound as typeof fetch);
    expect(result.tasks.map((x) => x.id)).toEqual(["abc123"]);
    expect(result.source).toBe("clickup-api-v2");
    expect(result.incomplete).toBe(false);
    const [target, options] = outbound.mock.calls[0]!;
    expect(String(target)).toBe(
      "https://api.clickup.com/api/v2/list/12345/task?page=0&include_closed=false&subtasks=false&include_timl=false",
    );
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("manual");
  });

  it("rejects wrong-home-List data rather than leaking another List's content", async () => {
    const fetcher = vi.fn(async () =>
      json({ tasks: [task("private123", { list: { id: "999" } })] }),
    );
    await expect(findScopedTasks(grant, fetcher as typeof fetch)).rejects.toThrowError(
      "CLICKUP_SCOPE_OR_SCHEMA_REJECTED",
    );
  });

  it("rejects path injection with zero HTTP requests", async () => {
    const fetcher = vi.fn(async () => json(task("ok123")));
    await expect(getScopedTask(grant, "../private", fetcher as typeof fetch)).rejects.toThrowError(
      "CLICKUP_INVALID_ARGUMENT",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects task-ID substitution after a successful scoped GET", async () => {
    const fetcher = vi.fn(async () => json(task("different")));
    await expect(getScopedTask(grant, "wanted", fetcher as typeof fetch)).rejects.toThrowError(
      "CLICKUP_SCOPE_OR_SCHEMA_REJECTED",
    );
  });

  it("denies forged redirect, upstream 401 and malformed JSON", async () => {
    for (const response of [
      new Response(null, { status: 302, headers: { location: "https://evil.invalid" } }),
      json({ err: "unauthorized" }, 401),
      new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    ]) {
      const fetcher = vi.fn(async () => response);
      await expect(findScopedTasks(grant, fetcher as typeof fetch)).rejects.toBeInstanceOf(
        ReadFailure,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("tracks pagination and makes the 50-result ceiling explicitly incomplete", async () => {
    const fetcher = vi.fn(async () =>
      json({ tasks: Array.from({ length: 100 }, (_, i) => task("t" + i)) }),
    );
    const result = await findScopedTasks(grant, fetcher as typeof fetch, 50);
    expect(result.tasks).toHaveLength(50);
    expect(result.incomplete).toBe(true);
    expect(result.pages_scanned).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects quota unavailability before any ClickUp network request", async () => {
    const blocked: ReadGrant = {
      ...grant,
      quota: {
        idFromName: () => "id",
        get: () => ({ fetch: async () => new Response(null, { status: 503 }) }),
      },
    };
    const outbound = vi.fn(async () => json({ tasks: [] }));
    await expect(findScopedTasks(blocked, outbound as typeof fetch)).rejects.toThrowError(
      "CLICKUP_QUOTA_UNAVAILABLE",
    );
    expect(outbound).not.toHaveBeenCalled();
  });

  it("recognizes a real 429 and does not immediately retry", async () => {
    const outbound = vi.fn(async () => json({ err: "limit" }, 429));
    await expect(findScopedTasks(grant, outbound as typeof fetch)).rejects.toThrowError(
      "CLICKUP_RATE_LIMITED",
    );
    expect(outbound).toHaveBeenCalledTimes(1);
  });
});

describe("48h report is metadata evidence, not a staff-inactivity verdict", () => {
  it("separates overdue, due soon and stale at exact 48h edge using SAST", () => {
    const now = Date.parse("2026-10-11T10:00:00Z");
    const base = {
      id: "a",
      name: "A",
      status: "to do",
      list_id: "12345",
      due_date_ms: null,
      date_updated_ms: null,
      assignee_ids: [],
      url: null,
    };
    const tasks = [
      { ...base, id: "old", due_date_ms: now - 1, date_updated_ms: now - 48 * 3_600_000 },
      { ...base, id: "soon", due_date_ms: now + 24 * 3_600_000 },
      { ...base, id: "untracked" },
    ];
    const report = createAttentionReport(tasks, "12345", 1, false, 24, true, now);
    expect(report.overdue.map((x) => x.id)).toEqual(["old"]);
    expect(report.due_soon.map((x) => x.id)).toEqual(["soon"]);
    expect(report.not_updated_for_48h.map((x) => x.id)).toEqual(["old"]);
    expect(report.evaluated_at_sast).toBe("2026-10-11T12:00:00.000+02:00");
    expect(report.incomplete).toBe(false);
  });
});
