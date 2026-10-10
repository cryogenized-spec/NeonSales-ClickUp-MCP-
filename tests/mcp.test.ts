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
      const block = result.content?.find((item) => item.type === "text");
      expect(block?.type).toBe("text");
      if (block?.type !== "text") {
        throw new Error("SDK did not return a diagnostic text block");
      }
      expect(JSON.parse(block.text)).toEqual({
        phase: 2,
        liveClickUp: false,
        authentication: "not-configured",
        note: "Internal SDK contract test only; no live ClickUp tasks or OAuth.",
      });
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
    const clients = Array.from(
      { length: 4 },
      (_, i) => new Client({ name: "staff-" + i, version: "0.1.0" }),
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
