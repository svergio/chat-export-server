import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

/**
 * @param {import('../core/server-core.js').ServerCore} core
 * @param {{ name?: string, version?: string }} [meta]
 */
export function createMcpServer(core, meta = {}) {
  const server = new McpServer({
    name: meta.name || 'chat-export-server',
    version: meta.version || core.serverVersion || '0.1.0'
  });
  registerTools(server, core);
  return server;
}
