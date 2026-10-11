import { describe, expect, it, vi } from "vitest";
import {
  beginClickUpOAuth,
  finishClickUpOAuth,
  personalClickUpCredential,
  clickUpConnectionStatus,
  disconnectClickUp,
} from "../src/clickup/per-user-oauth.js";

const key = btoa(String.fromCharCode(...new Uint8Array(32)));
const login = (id: string) => ({ scopes: ["mcp:read"], extra: { subject: "github:" + id } });

function fakeBindings() {
  const pending = new Map<string, { hash: string; subject: string; expires: number }>();
  const connected = new Map<string, { userId: string; workspaceId: string; token: string }>();
  const calls: string[] = [];
  const connections = {
    idFromName: (name: string) => name,
    get: (key: string) => ({
      fetch: async (request: Request) => {
        const route = new URL(request.url).pathname;
        calls.push(key + route);
        const body = (await request.json()) as Record<string, unknown>;
        const subject = String(body["subject"]);
        if (key !== "staff-clickup:" + subject) return new Response(null, { status: 403 });
        if (route === "/begin") {
          pending.set(key, {
            hash: String(body["nonceHash"]),
            subject,
            expires: Number(body["expiresAt"]),
          });
          return Response.json({ accepted: true });
        }
        if (route === "/consume") {
          const saved = pending.get(key);
          if (!saved || saved.hash !== body["nonceHash"] || saved.expires <= Date.now()) {
            return Response.json({ consumed: false });
          }
          pending.delete(key);
          return Response.json({ consumed: true });
        }
        if (route === "/store") {
          connected.set(key, {
            token: String(body["accessToken"]),
            userId: String(body["clickupUserId"]),
            workspaceId: String(body["workspaceId"]),
          });
          return Response.json({ stored: true });
        }
        if (route === "/credential") {
          const current = connected.get(key);
          return Response.json(
            current
              ? {
                  connected: true,
                  accessToken: current.token,
                  clickupUserId: current.userId,
                  workspaceId: current.workspaceId,
                }
              : { connected: false },
          );
        }
        if (route === "/status") {
          const current = connected.get(key);
          return Response.json(
            current
              ? {
                  connected: true,
                  clickupUserId: current.userId,
                  workspaceId: current.workspaceId,
                }
              : { connected: false },
          );
        }
        if (route === "/disconnect") {
          connected.delete(key);
          return Response.json({ disconnected: true });
        }
        return new Response(null, { status: 404 });
      },
    }),
  };
  const env = {
    ALLOWED_GITHUB_IDS: "11,22",
    CLICKUP_OAUTH_ENABLED: "true",
    CLICKUP_CLIENT_ID: "example-client",
    CLICKUP_CLIENT_SECRET: "synthetic-only",
    CLICKUP_STATE_KEY: key,
    CLICKUP_TOKEN_KEY: key,
    CLICKUP_WORKSPACE_ID: "999",
    CLICKUP_STAFF_USER_MAP: JSON.stringify({ "11": "707", "22": "809" }),
    CLICKUP_CONNECTIONS: connections,
    MCP_PUBLIC_ORIGIN: "https://stage.example",
  };
  const upstream = vi.fn(async (target: RequestInfo | URL, init?: RequestInit) => {
    const url = String(target);
    if (url.endsWith("/oauth/token")) {
      if (init?.method !== "POST" || init?.redirect !== "manual") throw Error("invalid exchange");
      return Response.json({ access_token: "test-user-token-no-value" });
    }
    if (url.endsWith("/user")) {
      return Response.json({ user: { id: 707 } });
    }
    if (url.endsWith("/team")) {
      return Response.json({ teams: [{ id: 999 }] });
    }
    throw Error("unexpected external route");
  });
  return { env, pending, connected, calls, upstream };
}

describe("independent ClickUp OAuth identity against current MCP principal", () => {
  it("rejects missing configuration and forged MCP principal before a state is created", async () => {
    const fixture = fakeBindings();
    await expect(beginClickUpOAuth(null, fixture.env)).rejects.toThrow("CLICKUP_ACCESS_DENIED");
    await expect(beginClickUpOAuth(login("33"), fixture.env)).rejects.toThrow(
      "CLICKUP_ACCESS_DENIED",
    );
    await expect(
      beginClickUpOAuth(login("11"), { ...fixture.env, CLICKUP_STATE_KEY: undefined }),
    ).rejects.toThrow("CLICKUP_OAUTH_NOT_CONFIGURED");
    expect(fixture.pending.size).toBe(0);
  });

  it("connects the real upstream authenticated ClickUp user once and rejects state replay", async () => {
    const fixture = fakeBindings();
    const started = await beginClickUpOAuth(login("11"), fixture.env);
    const authorize = new URL(started.authorization_url);
    expect(authorize.origin).toBe("https://app.clickup.com");
    expect(authorize.searchParams.get("client_id")).toBe(fixture.env.CLICKUP_CLIENT_ID);
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://stage.example/clickup/callback",
    );
    const state = authorize.searchParams.get("state");
    expect(state).toBeTruthy();
    const callback = new URL("https://stage.example/clickup/callback");
    callback.searchParams.set("state", state!);
    callback.searchParams.set("code", "sample_code_one");
    const fetched = fixture.upstream as typeof fetch;
    const first = await finishClickUpOAuth(new Request(callback), fixture.env, fetched);
    expect(first.status).toBe(200);
    expect(await first.text()).not.toContain("test-user-token");
    expect(fixture.connected.get("staff-clickup:github:11")?.userId).toBe("707");
    const second = await finishClickUpOAuth(new Request(callback), fixture.env, fetched);
    expect(second.status).toBe(400);
    expect(fixture.upstream).toHaveBeenCalledTimes(3);
    const own = await personalClickUpCredential(login("11"), fixture.env);
    expect(own.clickupUserId).toBe("707");
    expect(own.token).toBe("test-user-token-no-value");
    await expect(personalClickUpCredential(login("22"), fixture.env)).rejects.toThrow(
      "CLICKUP_ACCOUNT_NOT_CONNECTED",
    );
    expect(await clickUpConnectionStatus(login("22"), fixture.env)).toEqual({ connected: false });
    expect((await clickUpConnectionStatus(login("11"), fixture.env))["connected"]).toBe(true);
    await disconnectClickUp(login("11"), fixture.env);
    await expect(personalClickUpCredential(login("11"), fixture.env)).rejects.toThrow(
      "CLICKUP_ACCOUNT_NOT_CONNECTED",
    );
  });

  it("rejects tampered state and never exchanges a token with ClickUp", async () => {
    const fixture = fakeBindings();
    const started = await beginClickUpOAuth(login("11"), fixture.env);
    const url = new URL("https://stage.example/clickup/callback");
    url.searchParams.set(
      "state",
      new URL(started.authorization_url).searchParams.get("state")!.replace(/^11/, "22"),
    );
    url.searchParams.set("code", "fake-code");
    const response = await finishClickUpOAuth(
      new Request(url),
      fixture.env,
      fixture.upstream as typeof fetch,
    );
    expect(response.status).toBe(400);
    expect(fixture.upstream).not.toHaveBeenCalled();
  });

  it("rejects unapproved Workspace before storing individual credential", async () => {
    const fixture = fakeBindings();
    const started = await beginClickUpOAuth(login("22"), fixture.env);
    const url = new URL("https://stage.example/clickup/callback");
    url.searchParams.set("state", new URL(started.authorization_url).searchParams.get("state")!);
    url.searchParams.set("code", "somecode");
    const wrongTeam = vi.fn(async (target: RequestInfo | URL) => {
      const url = String(target);
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "fixture-opaque" });
      if (url.endsWith("/user")) return Response.json({ user: { id: 809 } });
      return Response.json({ teams: [{ id: 888 }] });
    });
    const response = await finishClickUpOAuth(
      new Request(url),
      fixture.env,
      wrongTeam as typeof fetch,
    );
    expect(response.status).toBe(400);
    expect(fixture.connected.size).toBe(0);
  });
  it("rejects wrong ClickUp account before storing a token, preserving an earlier valid connection", async () => {
    const fixture = fakeBindings();
    const correct = await beginClickUpOAuth(login("11"), fixture.env);
    const callback = new URL("https://stage.example/clickup/callback");
    callback.searchParams.set("state", new URL(correct.authorization_url).searchParams.get("state")!);
    callback.searchParams.set("code", "correct_token");
    expect((await finishClickUpOAuth(
      new Request(callback),
      fixture.env,
      fixture.upstream as typeof fetch,
    )).status).toBe(200);
    expect(fixture.connected.get("staff-clickup:github:11")?.token).toBe("test-user-token-no-value");

    const wrong = await beginClickUpOAuth(login("11"), fixture.env);
    const wrongCallback = new URL("https://stage.example/clickup/callback");
    wrongCallback.searchParams.set("state", new URL(wrong.authorization_url).searchParams.get("state")!);
    wrongCallback.searchParams.set("code", "wrong_account");
    const wrongAccount = vi.fn(async (target: RequestInfo | URL) => {
      const url = String(target);
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "wrong-person-token" });
      if (url.endsWith("/user")) return Response.json({ user: { id: 809 } });
      if (url.endsWith("/team")) return Response.json({ teams: [{ id: 999 }] });
      throw new Error("unexpected path");
    });
    const result = await finishClickUpOAuth(
      new Request(wrongCallback),
      fixture.env,
      wrongAccount as typeof fetch,
    );
    expect(result.status).toBe(400);
    expect(fixture.connected.get("staff-clickup:github:11")?.token).toBe("test-user-token-no-value");
    expect(fixture.calls.filter((entry) => entry.endsWith("/store"))).toHaveLength(1);
  });
});
