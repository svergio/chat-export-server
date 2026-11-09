import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-server.js';

/**
 * Attach MCP over stdio. Logs must go to stderr only.
 * @param {import('../core/server-core.js').ServerCore} core
 */
export async function startStdioMcp(core) {
  const server = createMcpServer(core);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}
