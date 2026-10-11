import { describe, expect, it, vi, afterEach } from "vitest";
import { ClickUpQuota } from "../src/clickup/quota-object.js";

/** Simulates the SQLite statements used by the Durable Object, preserving state on restarts. */
function createStorage() {
  const reservations: { at: number; subject: string }[] = [];
  let blockedUntil = 0;
  const exec = (sql: string, ...params: (number | string)[]) => {
    if (sql.startsWith("CREATE TABLE") || sql.startsWith("INSERT OR IGNORE")) return {};
    if (sql.startsWith("DELETE FROM reservations")) {
      const cutoff = Number(params[0]);
      for (let i = reservations.length - 1; i >= 0; i--) {
        if (reservations[i]!.at <= cutoff) reservations.splice(i, 1);
      }
      return {};
    }
    if (sql.startsWith("SELECT blocked_until"))
      return { one: () => ({ blocked_until_ms: blockedUntil }) };
    if (sql === "SELECT COUNT(*) AS count FROM reservations") {
      return { one: () => ({ count: reservations.length }) };
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM reservations WHERE subject")) {
      return { one: () => ({ count: reservations.filter((x) => x.subject === params[0]).length }) };
    }
    if (sql.startsWith("INSERT INTO reservations")) {
      reservations.push({ at: Number(params[0]), subject: String(params[1]) });
      return {};
    }
    if (sql.startsWith("UPDATE limits SET blocked_until")) {
      blockedUntil = Math.max(blockedUntil, Number(params[0]));
      return {};
    }
    throw new Error("Unexpected SQL: " + sql);
  };
  const state = {
    storage: { sql: { exec }, transactionSync: (fn: () => unknown) => fn() },
  } as unknown as DurableObjectState;
  return { state, reservations };
}

async function invoke(quota: ClickUpQuota, subject: string, route = "/reserve", until?: number) {
  const response = await quota.fetch(
    new Request("https://internal.invalid" + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, ...(until === undefined ? {} : { until }) }),
    }),
  );
  return response.json() as Promise<{ allowed: boolean; retryAfterMs?: number }>;
}

afterEach(() => vi.useRealTimers());

describe("SQLite-backed shared ClickUp quota behavior", () => {
  it("enforces 80 reservations per minute across 4 independent staff members", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const store = createStorage();
    const quota = new ClickUpQuota(store.state);
    const outcomes = await Promise.all(
      Array.from({ length: 84 }, (_, i) => invoke(quota, "github:" + (11 + (i % 4)))),
    );
    expect(outcomes.filter((item) => item.allowed)).toHaveLength(80);
    expect(outcomes.filter((item) => !item.allowed)).toHaveLength(4);
    expect(store.reservations).toHaveLength(80);
  });

  it("rejects excess per-staff requests and retains history when class is restarted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const store = createStorage();
    const quota = new ClickUpQuota(store.state);
    for (let i = 0; i < 30; i++) expect((await invoke(quota, "github:11")).allowed).toBe(true);
    expect((await invoke(quota, "github:11")).allowed).toBe(false);
    const restarted = new ClickUpQuota(store.state);
    expect((await invoke(restarted, "github:11")).allowed).toBe(false);
    expect((await invoke(restarted, "github:22")).allowed).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect((await invoke(restarted, "github:11")).allowed).toBe(true);
  });

  it("obeys upstream 429 cooldown and rejects forged internal subjects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const store = createStorage();
    const quota = new ClickUpQuota(store.state);
    const until = Date.now() + 30_000;
    expect((await invoke(quota, "github:11", "/cooldown", until)).allowed).toBe(true);
    expect((await invoke(quota, "github:22")).allowed).toBe(false);
    const invalid = await quota.fetch(
      new Request("https://internal.invalid/reserve", {
        method: "POST",
        body: JSON.stringify({ subject: "github:0" }),
      }),
    );
    expect(invalid.status).toBe(400);
    vi.advanceTimersByTime(30_001);
    expect((await invoke(quota, "github:22")).allowed).toBe(true);
  });
});
