import { describe, expect, it } from "vitest";
import { ClickUpUserConnection } from "../src/clickup/user-connection.js";

interface Row {
  subject: string;
  clickup_user_id: string;
  workspace_id: string;
  cipher: string;
  iv: string;
  connected_at_ms: number;
}
function fakeSqlite() {
  let pending: { hash: string; expires: number; subject: string } | undefined;
  let account: Row | undefined;
  const exec = (sql: string, ...params: (string | number)[]) => {
    let values: unknown[] = [];
    if (sql.startsWith("CREATE TABLE")) {
      // Durable schema initialization
    } else if (sql === "DELETE FROM pending") {
      pending = undefined;
    } else if (sql.startsWith("INSERT INTO pending")) {
      pending = { hash: String(params[0]), expires: Number(params[1]), subject: String(params[2]) };
    } else if (sql.startsWith("DELETE FROM pending WHERE nonce_hash")) {
      if (pending && pending.hash === params[0] && pending.subject === params[1] &&
          pending.expires > Number(params[2])) {
        values = [{ nonce_hash: pending.hash }];
        pending = undefined;
      }
    } else if (sql.startsWith("SELECT subject,clickup_user_id,workspace_id,cipher,iv")) {
      values = account ? [account] : [];
    } else if (sql.startsWith("INSERT OR REPLACE INTO connection")) {
      account = {
        subject: String(params[0]), clickup_user_id: String(params[1]),
        workspace_id: String(params[2]), cipher: String(params[3]),
        iv: String(params[4]), connected_at_ms: Number(params[5]),
      };
    } else if (sql.startsWith("DELETE FROM connection")) {
      if (account?.subject === params[0]) account = undefined;
    } else if (sql.startsWith("DELETE FROM pending WHERE subject")) {
      if (pending?.subject === params[0]) pending = undefined;
    } else {
      throw Error("Unknown synthetic SQL statement: " + sql);
    }
    return { toArray: () => values };
  };
  const state = {
    storage: { sql: { exec }, transactionSync: (fn: () => unknown) => fn() },
  } as unknown as DurableObjectState;
  return { state, stored: () => account };
}
const encryptedKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

async function call(vault: ClickUpUserConnection, route: string, body: Record<string, unknown>) {
  const response = await vault.fetch(new Request("https://private.invalid/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, data: await response.json() as Record<string, unknown> };
}

describe("actual encrypted SQLite per-user token vault", () => {
  it("encrypts the credential, authorizes only the originating subject and disconnects locally", async () => {
    const backing = fakeSqlite();
    const vault = new ClickUpUserConnection(backing.state, { CLICKUP_TOKEN_KEY: encryptedKey });
    const payload = {
      subject: "github:11", accessToken: "synthetic-personal-token-for-tests",
      clickupUserId: "707", workspaceId: "999",
    };
    expect((await call(vault, "store", payload)).data["stored"]).toBe(true);
    const stored = backing.stored()!;
    expect(stored.cipher).not.toContain(payload.accessToken);
    expect(stored.cipher).not.toBe(payload.accessToken);
    expect(stored.iv).toBeTruthy();
    expect((await call(vault, "credential", { subject: "github:22" })).data).toEqual({ connected: false });
    const actual = (await call(vault, "credential", { subject: "github:11" })).data;
    expect(actual).toMatchObject({
      connected: true, accessToken: payload.accessToken, clickupUserId: "707",
      workspaceId: "999",
    });
    expect((await call(vault, "disconnect", { subject: "github:22" })).data["disconnected"]).toBe(true);
    expect((await call(vault, "credential", { subject: "github:11" })).data["connected"]).toBe(true);
    await call(vault, "disconnect", { subject: "github:11" });
    expect(backing.stored()).toBeUndefined();
    expect((await call(vault, "credential", { subject: "github:11" })).data).toEqual({ connected: false });
  });

  it("atomically consumes a one-use state nonce and refuses replay or other user", async () => {
    const backing = fakeSqlite();
    const vault = new ClickUpUserConnection(backing.state, { CLICKUP_TOKEN_KEY: encryptedKey });
    const nonceHash = "a".repeat(64);
    const now = Date.now();
    const started = await call(vault, "begin", {
      subject: "github:11", nonceHash, expiresAt: now + 50_000,
    });
    expect(started.data["accepted"]).toBe(true);
    expect((await call(vault, "consume", { subject: "github:22", nonceHash })).data["consumed"]).toBe(false);
    expect((await call(vault, "consume", { subject: "github:11", nonceHash })).data["consumed"]).toBe(true);
    expect((await call(vault, "consume", { subject: "github:11", nonceHash })).data["consumed"]).toBe(false);
  });

  it("fails closed without token-encryption secret and does not store plaintext", async () => {
    const backing = fakeSqlite();
    const vault = new ClickUpUserConnection(backing.state, {});
    const result = await call(vault, "store", {
      subject: "github:11", accessToken: "synthetic-personal-token-for-tests",
      clickupUserId: "707", workspaceId: "999",
    });
    expect(result.status).toBe(503);
    expect(backing.stored()).toBeUndefined();
  });
});
