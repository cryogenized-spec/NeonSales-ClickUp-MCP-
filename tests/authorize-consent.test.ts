import { describe, expect, it, vi } from "vitest";
import { handleAuthorizationPage } from "../src/auth/authorize.js";
import type { OAuthEnv } from "../src/auth/env.js";

function fixture() {
  const requested = { scope: ["mcp:read"] };
  const approveConsent = vi.fn(async (_request: Request, _handle: string, _options: unknown) => ({
    request: requested,
    headers: new Headers(),
  }));
  const beginUpstream = vi.fn(async () => ({
    state: "browser-bound-state",
    headers: new Headers(),
  }));
  const oauth = { approveConsent, beginUpstream };
  const env = {
    OAUTH_PROVIDER: oauth,
    GITHUB_CLIENT_ID: "nonfunctional-fixture-client",
  } as unknown as OAuthEnv;
  const submit = (scopes: string[]) =>
    handleAuthorizationPage(
      new Request("https://mcp.example.com/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([
          ["handle", "browser-bound-handle"],
          ["decision", "approve"],
          ...scopes.map((scope): [string, string] => ["scope", scope]),
        ]),
      }),
      env,
      "https://mcp.example.com",
    );
  return { submit, approveConsent, beginUpstream };
}

describe("OAuth browser consent scope selection", () => {
  it("forwards explicit optional write consent even when the client originally asked only for read", async () => {
    const { submit, approveConsent, beginUpstream } = fixture();
    const response = await submit(["mcp:read", "mcp:write"]);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("github.com/login/oauth/authorize");
    expect(approveConsent).toHaveBeenCalledWith(
      expect.any(Request),
      "browser-bound-handle",
      { scope: ["mcp:read", "mcp:write"] },
    );
    expect(beginUpstream).toHaveBeenCalledTimes(1);
  });

  it("keeps a read-only grant read-only if optional write is not selected", async () => {
    const { submit, approveConsent } = fixture();
    expect((await submit(["mcp:read"])).status).toBe(302);
    expect(approveConsent).toHaveBeenCalledWith(
      expect.any(Request),
      "browser-bound-handle",
      { scope: ["mcp:read"] },
    );
  });

  it("rejects invalid scope submissions before beginning an upstream OAuth exchange", async () => {
    const { submit, approveConsent, beginUpstream } = fixture();
    expect((await submit(["mcp:read", "admin"])).status).toBe(400);
    expect(approveConsent).not.toHaveBeenCalled();
    expect(beginUpstream).not.toHaveBeenCalled();
  });
});
