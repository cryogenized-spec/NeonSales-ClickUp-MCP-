import { describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createProtocolHandler } from "../src/mcp/handler.js";

describe("official MCP SDK v2 in-process transport", () => {
  it("negotiates current protocol and discovers exactly one safe diagnostic tool", async () => {
    const handler = createProtocolHandler();
    const client = new Client(
      { name: "phase2-test", version: "0.1.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: async (input, init) => handler.fetch(new Request(input, init)),
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(["service_info"]);
      const result = await client.callTool({ name: "service_info", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain('"phase"');
      expect(JSON.stringify(result.content)).toContain("2");
      expect(JSON.stringify(result.content)).toContain("false");
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it("uses the official SDK to reject invalid tool arguments", async () => {
    const handler = createProtocolHandler();
    const client = new Client({ name: "phase2-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: async (input, init) => handler.fetch(new Request(input, init)),
    });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "service_info",
        arguments: { ignored: "should-fail" },
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it("supports four independent read-only protocol clients concurrently", async () => {
    const handler = createProtocolHandler();
    const clients = Array.from({ length: 4 }, (_, i) =>
      new Client({ name: "staff-" + i, version: "0.1.0" }),
    );
    try {
      const transports = clients.map(
        () =>
          new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
            fetch: async (input, init) => handler.fetch(new Request(input, init)),
          }),
      );
      await Promise.all(clients.map((client, i) => client.connect(transports[i]!)));
      const values = await Promise.all(
        clients.map((client) => client.callTool({ name: "service_info", arguments: {} })),
      );
      expect(values).toHaveLength(4);
      expect(values.every((value) => !value.isError)).toBe(true);
    } finally {
      await Promise.all(clients.map((client) => client.close()));
      await handler.close();
    }
  });
});
