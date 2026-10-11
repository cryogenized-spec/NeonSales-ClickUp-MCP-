import { parseStaffAllowlist } from "../auth/staff.js";
import { ReadFailure } from "./policy.js";

type Json = Record<string, unknown>;
type Fetcher = typeof fetch;
interface ConnectionStub { fetch(request: Request): Promise<Response> }
interface ConnectionBinding {
  idFromName(key: string): unknown;
  get(id: never): ConnectionStub;
}
interface ClickUpConfig {
  readonly origin: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly signingKey: string;
  readonly workspaceId: string;
  readonly binding: ConnectionBinding;
}
const CALLBACK_PATH = "/clickup/callback";
const API = "https://api.clickup.com/api/v2/";

function obj(v: unknown): Json | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : null;
}
function decimal(v: unknown): string | null {
  const text = typeof v === "string" || typeof v === "number" ? String(v) : "";
  return /^[1-9]\d{0,17}$/.test(text) ? text : null;
}
function config(raw: unknown): ClickUpConfig {
  const env = obj(raw);
  const origin = env?.["MCP_PUBLIC_ORIGIN"];
  const clientId = env?.["CLICKUP_CLIENT_ID"];
  const clientSecret = env?.["CLICKUP_CLIENT_SECRET"];
  const signingKey = env?.["CLICKUP_STATE_KEY"];
  const tokenKey = env?.["CLICKUP_TOKEN_KEY"];
  const binding = obj(env?.["CLICKUP_CONNECTIONS"]);
  const workspaceId = decimal(env?.["CLICKUP_WORKSPACE_ID"]);
  if (env?.["CLICKUP_OAUTH_ENABLED"] !== "true" ||
      typeof origin !== "string" || !/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(origin) ||
      typeof clientId !== "string" || !clientId || typeof clientSecret !== "string" || !clientSecret ||
      typeof signingKey !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(signingKey) ||
      typeof tokenKey !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(tokenKey) ||
      !workspaceId || !binding ||
      typeof binding["idFromName"] !== "function" ||
      typeof binding["get"] !== "function") {
    throw new ReadFailure("CLICKUP_OAUTH_NOT_CONFIGURED");
  }
  return {
    origin, clientId, clientSecret, signingKey, workspaceId,
    binding: binding as unknown as ConnectionBinding,
  };
}

function verifiedSubject(auth: unknown, env: unknown): string {
  const identity = obj(auth);
  const extra = obj(identity?.["extra"]);
  const bindings = obj(env);
  const subject = extra?.["subject"];
  const scopes = identity?.["scopes"];
  if (typeof subject !== "string" || !/^github:[1-9]\d{0,15}$/.test(subject) ||
      !Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== "mcp:read") {
    throw new ReadFailure("CLICKUP_ACCESS_DENIED");
  }
  try {
    if (!parseStaffAllowlist(bindings?.["ALLOWED_GITHUB_IDS"]).has(subject.slice(7))) {
      throw new Error("not active");
    }
  } catch { throw new ReadFailure("CLICKUP_ACCESS_DENIED"); }
  return subject;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], x => parseInt(x, 16));
}
async function key(secret: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(secret), x => x.charCodeAt(0));
  if (bytes.byteLength !== 32) throw new ReadFailure("CLICKUP_OAUTH_NOT_CONFIGURED");
  return crypto.subtle.importKey("raw", bytes, "HMAC", false, ["sign", "verify"]);
}
async function nonceHash(nonceHex: string): Promise<string> {
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", hexToBytes(nonceHex)));
  return bytesToHex(sha);
}
function staffStub(binding: ConnectionBinding, subject: string): ConnectionStub {
  return binding.get(binding.idFromName("staff-clickup:" + subject) as never);
}
async function internalCall(
  stub: ConnectionStub, action: string, body: Record<string, unknown>,
): Promise<Json> {
  const response = await stub.fetch(new Request("https://internal.invalid/" + action, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!response.ok) throw new ReadFailure("CLICKUP_ACCOUNT_STORE_UNAVAILABLE");
  const result = obj(await response.json());
  if (!result) throw new ReadFailure("CLICKUP_ACCOUNT_STORE_UNAVAILABLE");
  return result;
}

/** Callable only from the official SDK callback with OAuthProvider-verified authInfo. */
export async function beginClickUpOAuth(auth: unknown, env: unknown): Promise<{ authorization_url: string }> {
  const subject = verifiedSubject(auth, env);
  const settings = config(env);
  const created = Date.now();
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const base = subject.slice(7) + "." + created + "." + nonce;
  const signature = bytesToHex(new Uint8Array(await crypto.subtle.sign(
    "HMAC", await key(settings.signingKey), new TextEncoder().encode(settings.origin + ":" + base),
  )));
  const state = base + "." + signature;
  const stored = await internalCall(staffStub(settings.binding, subject), "begin", {
    subject, nonceHash: await nonceHash(nonce), expiresAt: created + 5 * 60_000,
  });
  if (stored["accepted"] !== true) throw new ReadFailure("CLICKUP_ACCOUNT_STORE_UNAVAILABLE");
  const url = new URL("https://app.clickup.com/api");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", settings.origin + CALLBACK_PATH);
  url.searchParams.set("state", state);
  return { authorization_url: url.toString() };
}

export async function clickUpConnectionStatus(auth: unknown, env: unknown): Promise<Json> {
  const subject = verifiedSubject(auth, env);
  const settings = config(env);
  const result = await internalCall(staffStub(settings.binding, subject), "status", { subject });
  return result["connected"] === true
    ? { connected: true, clickup_user_id: result["clickupUserId"], workspace_id: result["workspaceId"] }
    : { connected: false };
}

export async function disconnectClickUp(auth: unknown, env: unknown): Promise<Json> {
  const subject = verifiedSubject(auth, env);
  const settings = config(env);
  await internalCall(staffStub(settings.binding, subject), "disconnect", { subject });
  return { disconnected: true, note: "Local credential deleted. To revoke ClickUp application authorization, use ClickUp's Connected Apps settings." };
}

/** This is the only source for real ClickUp API tokens. Never accept model-provided credentials. */
export async function personalClickUpCredential(
  auth: unknown, env: unknown,
): Promise<{ subject: string; token: string; clickupUserId: string; workspaceId: string }> {
  const subject = verifiedSubject(auth, env);
  const settings = config(env);
  const record = await internalCall(staffStub(settings.binding, subject), "credential", { subject });
  if (record["connected"] !== true || typeof record["accessToken"] !== "string" ||
      !decimal(record["clickupUserId"]) || record["workspaceId"] !== settings.workspaceId) {
    throw new ReadFailure("CLICKUP_ACCOUNT_NOT_CONNECTED");
  }
  return {
    subject, token: record["accessToken"], clickupUserId: String(record["clickupUserId"]),
    workspaceId: settings.workspaceId,
  };
}

async function providerRequest(
  fetcher: Fetcher, path: string, token: string, body?: Record<string, string>,
): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetcher(new URL(path, API), {
      method: body ? "POST" : "GET",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : { Authorization: "Bearer " + token }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "manual", signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("ClickUp authentication request rejected");
    }
    const raw = await response.text();
    if (raw.length > 16_384) throw new Error("ClickUp authorization response too large");
    const payload = obj(JSON.parse(raw));
    if (!payload) throw new Error("Invalid ClickUp authorization response");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/** Public browser callback: authenticated solely by expiring HMAC + atomic one-time DO nonce. */
export async function finishClickUpOAuth(
  request: Request, env: unknown, fetcher: Fetcher = fetch,
): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  };
  const fail = () => new Response("ClickUp connection was not completed. Reconnect from your MCP client.", { status: 400, headers });
  if (request.method !== "GET" || new URL(request.url).pathname !== CALLBACK_PATH) return fail();
  try {
    const settings = config(env);
    const url = new URL(request.url);
    if (url.origin !== settings.origin) return fail();
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!/^[A-Za-z0-9._~-]{1,256}$/.test(code)) return fail();
    const m = /^([1-9]\d{0,15})\.(\d{13})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(state);
    if (!m) return fail();
    const [, githubId, when, nonce, signature] = m;
    if (!githubId || !when || !nonce || !signature) return fail();
    const age = Date.now() - Number(when);
    if (age < 0 || age > 5 * 60_000) return fail();
    const envRecord = obj(env);
    if (!parseStaffAllowlist(envRecord?.["ALLOWED_GITHUB_IDS"]).has(githubId)) return fail();
    const authenticated = await crypto.subtle.verify(
      "HMAC", await key(settings.signingKey), hexToBytes(signature),
      new TextEncoder().encode(settings.origin + ":" + [githubId, when, nonce].join(".")),
    );
    if (!authenticated) return fail();
    const subject = "github:" + githubId;
    const stub = staffStub(settings.binding, subject);
    const consumed = await internalCall(stub, "consume", { subject, nonceHash: await nonceHash(nonce) });
    if (consumed["consumed"] !== true) return fail();
    const exchange = await providerRequest(fetcher, "oauth/token", "", {
      client_id: settings.clientId, client_secret: settings.clientSecret, code,
    });
    if (typeof exchange["access_token"] !== "string" || exchange["access_token"].length < 8 ||
        exchange["access_token"].length > 4096) return fail();
    const token = exchange["access_token"];
    const [profile, teams] = await Promise.all([
      providerRequest(fetcher, "user", token),
      providerRequest(fetcher, "team", token),
    ]);
    const clickupId = decimal(obj(profile["user"])?.["id"]);
    if (!clickupId || !Array.isArray(teams["teams"]) ||
        !teams["teams"].some(t => decimal(obj(t)?.["id"]) === settings.workspaceId)) {
      return fail();
    }
    const stored = await internalCall(stub, "store", {
      subject, accessToken: token, clickupUserId: clickupId, workspaceId: settings.workspaceId,
    });
    if (stored["stored"] !== true) return fail();
    return new Response("Your ClickUp account is connected to NeonSales MCP. You may close this page.", { status: 200, headers });
  } catch {
    return fail();
  }
}
