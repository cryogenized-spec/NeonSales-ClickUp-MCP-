import { describe, expect, it } from "vitest";
import { renderConsentPage, validatedReadOnlyScopes } from "../src/auth/consent.js";

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
    expect(html).not.toContain("evil.example<svg");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('value="" onfocus');
    expect(html).toContain("localhost");
    expect(html).toContain("computer");
    expect(html).toContain('name="decision" value="deny"');
  });
});

describe("professional consent page invariants", () => {
  it("renders a responsive self-contained page without scripts or third-party assets", () => {
    const html = renderConsentPage(
      {
        clientName: "Claude",
        clientDomain: "claude.ai",
        redirectHost: "claude.ai",
        redirectIsLoopback: false,
        scope: ["mcp:read"],
      },
      "opaque-consent-handle",
    );
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("@media(max-width:520px)");
    expect(html).toContain('aria-labelledby="consent-heading"');
    expect(html).toContain('method="post" action="/authorize"');
    expect(html).toContain('name="handle" value="opaque-consent-handle"');
    expect(html).toContain('name="scope" type="checkbox" checked value="mcp:read"');
    expect(html).toContain('name="decision" value="approve"');
    expect(html).toContain('name="decision" value="deny"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('src="http');
  });

  it("warns clearly for localhost redirects and unknown publishers", () => {
    const html = renderConsentPage(
      {
        clientName: "Self-claimed",
        redirectHost: "localhost",
        redirectIsLoopback: true,
        scope: ["mcp:read"],
      },
      "handle",
    );
    expect(html).toContain("name is self-declared");
    expect(html).toContain("an app on your computer");
  });
});

describe("read-only OAuth consent scope enforcement", () => {
  it.each([
    [["mcp:read", "offline_access"]],
    [["mcp:read", "mcp:write"]],
    [["mcp:read", "mcp:read"]],
    [[""]],
    [[]],
  ])("rejects forged, duplicate and empty scopes: %j", (values) => {
    expect(() => validatedReadOnlyScopes(values)).toThrow();
  });

  it("allows only exactly one explicitly approved mcp:read scope", () => {
    expect(validatedReadOnlyScopes(["mcp:read"])).toEqual(["mcp:read"]);
  });
});
