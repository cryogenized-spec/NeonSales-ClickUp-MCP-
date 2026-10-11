import { describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createProtocolHandler } from "../src/mcp/handler.js";

function configuration() {
  return {
    CLICKUP_LIVE_ENABLED: "true",
    CLICKUP_LIST_ID: "12345",
    CLICKUP_OAUTH_ENABLED: "true",
    CLICKUP_CLIENT_ID: "fixture-client",
    CLICKUP_CLIENT_SECRET: "fixture-secret",
    CLICKUP_STATE_KEY: btoa(String.fromCharCode(...new Uint8Array(32))),
    CLICKUP_TOKEN_KEY: btoa(String.fromCharCode(...new Uint8Array(32))),
    CLICKUP_WORKSPACE_ID: "555",
    CLICKUP_STAFF_USER_MAP: JSON.stringify({ "11": "456", "22": "654" }),
    MCP_PUBLIC_ORIGIN: "https://staging.example",
    CLICKUP_CONNECTIONS: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () =>
          Response.json({
            connected: true,
            clickupUserId: "456",
            workspaceId: "555",
            accessToken: "nonworking-personal-fixture",
          }),
      }),
    },
    CLICKUP_READ_GITHUB_IDS: "11",
    ALLOWED_GITHUB_IDS: "11,22",
    CLICKUP_QUOTA: {
      idFromName: () => "same-token",
      get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
    },
  };
}

describe("Phase 4 official SDK integration", () => {
  it("advertises three operational read tools plus catalogue and diagnostic", async () => {
    const outbound = vi.fn(async (url: RequestInfo | URL) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/list/12345"))
        return Response.json({ id: "12345", space: { id: "765" } });
      if (pathname.endsWith("/team/555/space")) return Response.json({ spaces: [{ id: "765" }] });
      return Response.json({ tasks: [] });
    });
    const handler = createProtocolHandler({
      bindings: configuration(),
      fetcher: outbound as typeof fetch,
    });
    const client = new Client({ name: "scoped-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: async (input, init) =>
        handler.fetch(new Request(input, init), {
          authInfo: {
            token: "verified-internal-only",
            clientId: "mcp-test",
            scopes: ["mcp:read"],
            extra: { subject: "github:11" },
          },
        }),
    });
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "clickup_tool_catalog",
        "connect_clickup_account",
        "create_scoped_task",
        "disconnect_clickup_account",
        "find_scoped_tasks",
        "get_attention_report",
        "get_clickup_connection_status",
        "get_scoped_list",
        "get_scoped_task",
        "get_scoped_task_comments",
        "service_info",
      ]);
      for (const tool of tools) {
        expect(tool.annotations?.readOnlyHint).toBe(
          !["connect_clickup_account", "disconnect_clickup_account", "create_scoped_task"].includes(
            tool.name,
          ),
        );
        expect(tool.annotations?.destructiveHint).toBe(tool.name === "disconnect_clickup_account");
      }
      const diagnostic = await client.callTool({ name: "service_info", arguments: {} });
      expect(diagnostic.structuredContent).toMatchObject({
        phase: 6,
        liveClickUp: true,
        authentication: "github-oauth-plus-individual-clickup-oauth",
      });
      await expect(
        client.callTool({
          name: "create_scoped_task",
          arguments: { name: "No write scope" },
        }),
      ).rejects.toThrow();
      expect(outbound).not.toHaveBeenCalled();
      const response = await client.callTool({
        name: "find_scoped_tasks",
        arguments: { max_results: 4 },
      });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({
        source: "clickup-api-v2",
        list_id: "12345",
        incomplete: false,
        pages_scanned: 1,
      });
      expect(outbound).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it("rejects user header spoofing and unapproved subject before touching ClickUp", async () => {
    const outbound = vi.fn(async () =>
      Response.json({ tasks: [] }, { headers: { "content-type": "application/json" } }),
    );
    const handler = createProtocolHandler({
      bindings: configuration(),
      fetcher: outbound as typeof fetch,
    });
    const client = new Client({ name: "forger", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        request.headers.set("X-User", "github:11");
        return handler.fetch(request, {
          authInfo: {
            token: "verified-internal-only",
            clientId: "mcp-test",
            scopes: ["mcp:read"],
            extra: { subject: "github:22" },
          },
        });
      },
    });
    try {
      await client.connect(transport);
      const response = await client.callTool({ name: "get_attention_report", arguments: {} });
      expect(response.isError).toBe(true);
      expect(response.content).toMatchObject([
        { type: "text", text: '{"code":"CLICKUP_ACCESS_DENIED"}' },
      ]);
      expect(outbound).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it("executes a native create task through the official MCP protocol only with separately consented write scope", async () => {
    const outbound = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/list/12345") && options?.method === "GET")
        return Response.json({ id: "12345", space: { id: 765 } });
      if (pathname.endsWith("/team/555/space") && options?.method === "GET")
        return Response.json({ spaces: [{ id: 765 }] });
      expect(String(url)).toBe("https://api.clickup.com/api/v2/list/12345/task");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toMatchObject({
        Authorization: "nonworking-personal-fixture",
      });
      return Response.json({ id: "new123", list: { id: "12345" } });
    });
    const handler = createProtocolHandler({
      bindings: configuration(),
      fetcher: outbound as typeof fetch,
    });
    const client = new Client({ name: "write-integration-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: async (input, init) =>
        handler.fetch(new Request(input, init), {
          authInfo: {
            token: "verified-client-token",
            clientId: "client-test",
            scopes: ["mcp:read", "mcp:write"],
            extra: { subject: "github:11" },
          },
        }),
    });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "create_scoped_task",
        arguments: { name: "Synthetic task" },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        action: "task_created",
        task_id: "new123",
        accepted: true,
      });
      expect(outbound).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
      await handler.close();
    }
  });
});
