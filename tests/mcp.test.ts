import { describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { createProtocolHandler } from "../src/mcp/handler.js";

/** Drive raw HTTP frames directly through the real SDK handler, without Client sanitization. */
function rawPost(
  handler: ReturnType<typeof createProtocolHandler>,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler.fetch(
    new Request("http://local.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body,
    }),
  );
}

function modernFrame(version: string, toolName?: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 42,
    method: toolName === undefined ? "tools/list" : "tools/call",
    params: {
      ...(toolName === undefined ? {} : { name: toolName, arguments: {} }),
      _meta: {
        "io.modelcontextprotocol/protocolVersion": version,
        "io.modelcontextprotocol/clientInfo": { name: "raw-frame-test", version: "0.1.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
}

describe("official MCP SDK v2 in-process transport", () => {
  it("negotiates current protocol and discovers exactly one safe diagnostic tool", async () => {
    const handler = createProtocolHandler();
    const client = new Client(
      { name: "phase3-test", version: "0.1.0" },
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
      expect(result.structuredContent).toEqual(JSON.parse(block.text));
      expect(JSON.parse(block.text)).toEqual({
        phase: 3,
        liveClickUp: false,
        authentication: "github-oauth-required",
        note: "Phase 3 read-only diagnostic; GitHub OAuth gates the public MCP endpoint. Live ClickUp access is disabled.",
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it("uses the official SDK to reject invalid tool arguments", async () => {
    const handler = createProtocolHandler();
    const client = new Client({ name: "phase3-test", version: "0.1.0" });
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

  it("passes four request-scoped authenticated subjects into real SDK tool callbacks", async () => {
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "subject-isolation-test", version: "0.1.0" });
      server.registerTool(
        "whoami",
        {
          inputSchema: fromJsonSchema<Record<string, never>>({
            type: "object",
            properties: {},
            additionalProperties: false,
          }),
        },
        async (_args, extra) => ({
          content: [
            { type: "text", text: String(extra.http?.authInfo?.extra?.["subject"] ?? "missing") },
          ],
        }),
      );
      return server;
    });
    try {
      const actual = await Promise.all(
        ["11", "22", "33", "44"].map(async (id) => {
          const client = new Client({ name: "verified-" + id, version: "0.1.0" });
          const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
            fetch: async (input, init) =>
              handler.fetch(new Request(input, init), {
                authInfo: {
                  token: "internal-test-" + id,
                  clientId: "client-" + id,
                  scopes: ["mcp:read"],
                  extra: { subject: "github:" + id },
                },
              }),
          });
          try {
            await client.connect(transport);
            const response = await client.callTool({ name: "whoami", arguments: {} });
            const block = response.content?.find((item) => item.type === "text");
            return block?.type === "text" ? block.text : "missing";
          } finally {
            await client.close();
          }
        }),
      );
      expect(actual).toEqual(["github:11", "github:22", "github:33", "github:44"]);
    } finally {
      await handler.close();
    }
  });

  it("rejects malformed raw JSON instead of dispatching an SDK request", async () => {
    const handler = createProtocolHandler();
    try {
      const headers = {
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/list",
      };
      const response = await rawPost(handler, '{"jsonrpc":"2.0","id":7,"method":', headers);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32700 },
      });
    } finally {
      await handler.close();
    }
  });

  it("rejects raw calls to unregistered tools without running a tool", async () => {
    const handler = createProtocolHandler();
    try {
      const response = await rawPost(handler, modernFrame("2026-07-28", "nonexistent_tool"), {
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "nonexistent_tool",
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        id: 42,
        error: { code: -32602 },
      });
    } finally {
      await handler.close();
    }
  });

  it("rejects an unsupported modern protocol version without legacy fallback", async () => {
    const handler = createProtocolHandler();
    try {
      const response = await rawPost(handler, modernFrame("2030-01-01"), {
        "MCP-Protocol-Version": "2030-01-01",
        "Mcp-Method": "tools/list",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        id: 42,
        error: { code: -32022 },
      });
    } finally {
      await handler.close();
    }
  });

  it("rejects header/body protocol-version disagreement before dispatch", async () => {
    const handler = createProtocolHandler();
    try {
      const response = await rawPost(handler, modernFrame("2026-07-28"), {
        "MCP-Protocol-Version": "2030-01-01",
        "Mcp-Method": "tools/list",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        id: 42,
        error: { code: -32020 },
      });
    } finally {
      await handler.close();
    }
  });
});
