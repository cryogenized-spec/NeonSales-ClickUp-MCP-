import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./create-server.js";

/**
 * Genuine official MCP v2 handler for isolated protocol tests.
 *
 * Do NOT mount this handler on a public Worker route until OAuth
 * validation and per-user authorization have been implemented.
 */
export function createProtocolHandler() {
  return createMcpHandler(() => createServer());
}
