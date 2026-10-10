import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("external Worker HTTP perimeter (no OAuth installed)", () => {
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  it.each(methods)("denies %s /mcp before an MCP handler can execute", async (method) => {
    const headers = new Headers({
      Authorization: "Bearer forged",
      "X-User": "administrator",
      "X-Forwarded-User": "boss",
    });
    const response = await worker.fetch(
      new Request("https://worker.invalid/mcp?debug=1&disable_auth=true", { method, headers }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "AUTH_NOT_CONFIGURED" });
  });

  it("returns 404 for other routes and trailing-slash probes", async () => {
    for (const route of ["/", "/mcp/", "/healthz", "/.well-known/oauth-authorization-server"]) {
      const response = await worker.fetch(new Request("https://worker.invalid" + route));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("rejects four simultaneous forged principals with no identity leakage", async () => {
    const requests = ["gareth", "sameer", "monisha", "jerome"].map(
      (subject) =>
        new Request("https://worker.invalid/mcp", {
          method: "POST",
          headers: {
            "X-User": subject,
            Authorization: "Bearer " + subject,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: subject, method: "tools/list" }),
        }),
    );
    const responses = await Promise.all(requests.map((request) => worker.fetch(request)));
    expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 503]);
    for (const response of responses) {
      const body = await response.text();
      expect(body).toBe('{"code":"AUTH_NOT_CONFIGURED"}');
      expect(body).not.toMatch(/gareth|sameer|monisha|jerome/);
    }
  });
});
