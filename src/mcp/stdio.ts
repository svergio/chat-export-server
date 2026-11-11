import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-server.js';
import type { ServerCore } from '../core/server-core.js';

// Attach MCP over stdio. Logs must go to stderr only.
export async function startStdioMcp(core: ServerCore) {
  const server = createMcpServer(core);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}
