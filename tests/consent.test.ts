import { describe, expect, it } from "vitest";
import { renderConsentPage } from "../src/auth/consent.js";

describe("browser-bound OAuth consent UI", () => {
  it("escapes attacker-controlled client name, domain, scopes and handle", () => {
    const html = renderConsentPage({
      clientName: '<img src=x onerror=alert(1)>',
      clientDomain: 'evil.example<svg onload=alert(2)>',
      redirectHost: 'localhost',
      redirectIsLoopback: true,
      scope: ['mcp:read"><script>alert(3)</script>'],
    }, '" onfocus="alert(4)');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('value="" onfocus');
    expect(html).toContain("localhost");
    expect(html).toContain("computer");
    expect(html).toContain('name="decision" value="deny"');
  });
});
