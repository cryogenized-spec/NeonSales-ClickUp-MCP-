import { describe, expect, it } from "vitest";
import { renderConsentPage } from "../src/auth/consent.js";

describe("browser-bound OAuth consent UI", () => {
  it("escapes attacker-controlled client name, domain, scopes and handle", () => {
    const html = renderConsentPage(
      {
        clientName: "<img src=x onerror=alert(1)>",
        clientDomain: "evil.example<svg onload=alert(2)>",
        redirectHost: "localhost",
        redirectIsLoopback: true,
        scope: ['mcp:read"><script>alert(3)</script>'],
      },
      '" onfocus="alert(4)',
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('value="" onfocus');
    expect(html).toContain("localhost");
    expect(html).toContain("computer");
    expect(html).toContain('name="decision" value="deny"');
  });
});

import { vi } from "vitest";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { handleAuthorizationPage } from "../src/auth/authorize.js";
import type { OAuthEnv } from "../src/auth/env.js";

describe("consent scope escalation and malformed submissions", () => {
  function setup(scopeValues: string[]) {
    const approveConsent = vi.fn(async () => ({
      request: { scope: ["mcp:read"] },
      headers: new Headers(),
    }));
    const beginUpstream = vi.fn(async () => ({
      state: "browser-bound-state",
      headers: new Headers(),
    }));
    const oauth = { approveConsent, beginUpstream } as unknown as OAuthHelpers;
    const env = {
      OAUTH_PROVIDER: oauth,
      OAUTH_KV: {},
      MCP_PUBLIC_ORIGIN: "https://mcp.example.com",
      ALLOWED_GITHUB_IDS: "11",
      GITHUB_CLIENT_ID: "test-client",
      GITHUB_CLIENT_SECRET: "test-secret",
    } satisfies OAuthEnv;
    const data = new URLSearchParams({ handle: "fake-browser-handle", decision: "approve" });
    for (const scope of scopeValues) data.append("scope", scope);
    const request = new Request("https://mcp.example.com/authorize", {
      method: "POST",
      body: data,
    });
    return { request, env, approveConsent, beginUpstream };
  }

  it.each([
    [["mcp:read", "offline_access"]],
    [["mcp:read", "mcp:write"]],
    [["mcp:read", "mcp:read"]],
    [[""]],
    [[]],
  ])("rejects injected, duplicated or empty consent scopes %j without consuming a handle", async (scopeValues) => {
    const { request, env, approveConsent, beginUpstream } = setup(scopeValues);
    const response = await handleAuthorizationPage(request, env, "https://mcp.example.com");
    expect(response.status).toBe(400);
    expect(approveConsent).not.toHaveBeenCalled();
    expect(beginUpstream).not.toHaveBeenCalled();
  });

  it("permits only a single explicit read-only scope", async () => {
    const { request, env, approveConsent } = setup(["mcp:read"]);
    const response = await handleAuthorizationPage(request, env, "https://mcp.example.com");
    expect(response.status).toBe(302);
    expect(approveConsent).toHaveBeenCalledExactlyOnceWith(
      request,
      "fake-browser-handle",
      { scope: ["mcp:read"] },
    );
  });
});
