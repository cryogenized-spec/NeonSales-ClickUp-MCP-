import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./create-server.js";

/**
 * Official MCP v2 handler. The public Worker mounts it only behind
 * the OAuth provider and per-request staff/scope checks.
 * Standalone SDK tests invoke it without the public authentication layer.
 */
export function createProtocolHandler() {
  return createMcpHandler(() => createServer());
}
