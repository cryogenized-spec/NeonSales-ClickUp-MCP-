/**
 * Single strongly-consistent SQLite Durable Object per shared ClickUp token.
 * The public Worker never routes external requests here; only the internal binding can.
 * Each request is reserved before HTTP, with a conservative token-wide 80/min ceiling.
 */
export class ClickUpQuota {
  constructor(private readonly state: DurableObjectState) {
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS reservations (at_ms INTEGER NOT NULL, subject TEXT NOT NULL)",
    );
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS limits (id INTEGER PRIMARY KEY CHECK (id = 1), blocked_until_ms INTEGER NOT NULL)",
    );
    state.storage.sql.exec("INSERT OR IGNORE INTO limits (id, blocked_until_ms) VALUES (1, 0)");
  }

  async fetch(request: Request): Promise<Response> {
    const route = new URL(request.url).pathname;
    if (request.method !== "POST" || (route !== "/reserve" && route !== "/cooldown")) {
      return new Response(null, { status: 404 });
    }
    const raw: unknown = await request.json().catch(() => null);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return new Response(null, { status: 400 });
    }
    const body = raw as Record<string, unknown>;
    const subject = body["subject"];
    if (typeof subject !== "string" || !/^github:[1-9]\d*$/.test(subject)) {
      return new Response(null, { status: 400 });
    }
    const now = Date.now();
    if (route === "/cooldown") {
      const until = body["until"];
      if (typeof until !== "number" || !Number.isSafeInteger(until) || until < now) {
        return new Response(null, { status: 400 });
      }
      this.state.storage.transactionSync(() => {
        this.state.storage.sql.exec(
          "UPDATE limits SET blocked_until_ms = MAX(blocked_until_ms, ?) WHERE id = 1",
          Math.min(until, now + 3_600_000),
        );
      });
      return Response.json({ allowed: true });
    }
    const result = this.state.storage.transactionSync(() => {
      this.state.storage.sql.exec("DELETE FROM reservations WHERE at_ms <= ?", now - 60_000);
      const block = this.state.storage.sql
        .exec<{ blocked_until_ms: number }>("SELECT blocked_until_ms FROM limits WHERE id = 1")
        .one();
      if (block.blocked_until_ms > now) {
        return { allowed: false, retryAfterMs: block.blocked_until_ms - now };
      }
      const global = this.state.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM reservations")
        .one().count;
      const personal = this.state.storage.sql
        .exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM reservations WHERE subject = ?",
          subject,
        )
        .one().count;
      if (global >= 80 || personal >= 30) {
        return { allowed: false, retryAfterMs: 60_000 };
      }
      this.state.storage.sql.exec(
        "INSERT INTO reservations (at_ms, subject) VALUES (?, ?)",
        now,
        subject,
      );
      return { allowed: true, retryAfterMs: 0 };
    });
    return Response.json(result);
  }
}
