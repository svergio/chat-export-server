import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMcpServer } from './create-server.js';
import type { ServerCore } from '../core/server-core.js';

// Extract Bearer token. Never log the token.
export function extractBearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return null;
  const trimmed = h.trim();
  if (trimmed.length > 4096 || !/^bearer[\s]/i.test(trimmed)) return null;
  const token = trimmed.slice(6).trim();
  return token || null;
}

// Handle /mcp Streamable HTTP (stateless). Returns true if handled.
export async function handleMcpHttp(
  req: IncomingMessage,
  res: ServerResponse,
  core: ServerCore,
  url: URL
): Promise<boolean> {
  if (url.pathname !== '/mcp') return false;

  const token = extractBearer(req);
  if (!core.verifyMcpBearer(token)) {
    core.audit({ action: 'mcp.auth', ok: false, code: 'UNAUTHORIZED', transport: 'http' });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'invalid or missing bearer key' } }));
    return true;
  }

  if (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE') {
    const server = createMcpServer(core);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null
          })
        );
      }
      core.audit({
        action: 'mcp.http',
        ok: false,
        message: err?.message || String(err)
      });
    } finally {
      res.on('close', () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
    }
    return true;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Method not allowed' } }));
  return true;
}
