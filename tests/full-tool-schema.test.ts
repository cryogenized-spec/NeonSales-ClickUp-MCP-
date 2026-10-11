import { describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createProtocolHandler } from "../src/mcp/handler.js";
import {
  FIELD_SCHEMAS,
  PLANNED_TOOLS,
  plannedInputSchema,
  plannedDescription,
} from "../src/mcp/planned-tool-catalog.js";

function fixture(key: string): unknown {
  if (key === "tasks") return [{ name: "Fixture task" }];
  if (key === "updates") return [{ task_id: "t123", status: "To Do" }];
  if (key === "assignee_ids") return [42];
  if (key === "assignee_queries") return ["Sample User"];
  if (key === "page_ids") return ["pg123"];
  if (key === "field_value") return "sample";
  if (key === "priority" || key === "max_results") return 1;
  if (key === "start_ms") return 1_700_000_000_000;
  if (key === "duration_ms") return 60_000;
  if (key === "due_date_ms") return 1_700_000_000_000;
  if (key === "query" || key === "text" || key === "description" || key === "content")
    return "Sample user text";
  if (
    key === "workspace_id" ||
    (key.endsWith("_id") &&
      ["workspace_id", "space_id", "list_id", "folder_id", "target_list_id"].includes(key))
  )
    return "12345";
  return key === "name" || key === "title" ? "Sample name" : "abc123";
}

describe("full model-visible ClickUp MCP catalog", () => {
  it("provides a unique, closed and bounded schema for every planned official capability", () => {
    expect(PLANNED_TOOLS).toHaveLength(47);
    expect(new Set(PLANNED_TOOLS.map((tool) => tool.name)).size).toBe(47);
    expect(PLANNED_TOOLS.filter((tool) => tool.risk !== "read").length).toBeGreaterThan(15);
    for (const tool of PLANNED_TOOLS) {
      const schema = plannedInputSchema(tool);
      expect(schema["type"]).toBe("object");
      expect(schema["additionalProperties"]).toBe(false);
      expect(schema["required"]).toEqual([...tool.required]);
      expect(Object.keys(schema["properties"] as object).sort()).toEqual(
        [...tool.required, ...tool.optional].sort(),
      );
      expect(plannedDescription(tool)).toContain("NOT AVAILABLE");
      expect(plannedDescription(tool)).toContain("NOT_IMPLEMENTED");
      expect(tool.purpose.length).toBeGreaterThan(12);
      for (const field of [...tool.required, ...tool.optional]) {
        expect(FIELD_SCHEMAS[field]).toBeDefined();
        expect(String(FIELD_SCHEMAS[field]?.["description"]).length).toBeGreaterThan(10);
      }
    }
  });

  it("exposes all 52 properly-described tools through the REAL MCP SDK without secrets", async () => {
    const outbound = vi.fn(async () => {
      throw new Error("must never fetch");
    });
    const handler = createProtocolHandler({ bindings: {}, fetcher: outbound as typeof fetch });
    const client = new Client({ name: "schema-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: async (input, init) =>
        handler.fetch(new Request(input, init), {
          authInfo: {
            token: "internal-fixture",
            clientId: "schema-test",
            scopes: ["mcp:read"],
            extra: { subject: "github:11" },
          },
        }),
    });
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(52);
      for (const item of tools) {
        expect(item.description?.length).toBeGreaterThan(45);
        expect(item.inputSchema.type).toBe("object");
        expect(item.inputSchema["additionalProperties"]).toBe(false);
      }

      const planned = new Set(PLANNED_TOOLS.map((tool) => tool.name));
      for (const tool of tools.filter((item) => planned.has(item.name))) {
        const source = PLANNED_TOOLS.find((item) => item.name === tool.name)!;
        expect(tool.description).toContain("NOT AVAILABLE");
        expect(tool.description).toContain("NOT_IMPLEMENTED");
        expect(tool.annotations?.readOnlyHint).toBe(source.risk === "read");
        expect(tool.annotations?.destructiveHint).toBe(source.risk === "destructive");
        expect(tool.inputSchema.required).toEqual([...source.required]);
        expect(tool.outputSchema).toBeDefined();
      }

      const info = await client.callTool({ name: "get_tool_catalog", arguments: {} });
      expect(info.isError).not.toBe(true);
      const catalog = info.structuredContent as { planned: unknown[]; implemented: unknown[] };
      expect(catalog.planned).toHaveLength(47);
      expect(catalog.implemented).toHaveLength(3);

      for (const tool of PLANNED_TOOLS) {
        const args = Object.fromEntries(tool.required.map((key) => [key, fixture(key)]));
        const response = await client.callTool({ name: tool.name, arguments: args });
        expect(response.isError, tool.name).toBe(true);
        expect(response.structuredContent).toMatchObject({
          status: "unavailable",
          code: "CLICKUP_TOOL_NOT_IMPLEMENTED",
          tool: tool.name,
        });
      }
      expect(outbound).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it("has no hidden open-ended generic REST or enabled task mutation route", () => {
    expect(PLANNED_TOOLS.every((tool) => !/execute|request|arbitrary_api/.test(tool.name))).toBe(
      true,
    );
    for (const tool of PLANNED_TOOLS) {
      expect(plannedInputSchema(tool)).not.toHaveProperty("additionalProperties", true);
    }
  });
});
