import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import type { ServerCore } from '../core/server-core.js';

export function createMcpServer(core: ServerCore, meta: { name?: string; version?: string } = {}): McpServer {
  const server = new McpServer({
    name: meta.name || 'chat-export-server',
    version: meta.version || core.serverVersion || '1.0.3'
  });
  registerTools(server, core);
  return server;
}
