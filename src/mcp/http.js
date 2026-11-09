import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './create-server.js';

/**
 * Extract Bearer token. Never log the token.
 * @param {import('node:http').IncomingMessage} req
 */
export function extractBearer(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * Handle /mcp Streamable HTTP (stateless). Returns true if handled.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {import('../core/server-core.js').ServerCore} core
 * @param {URL} url
 */
export async function handleMcpHttp(req, res, core, url) {
  if (url.pathname !== '/mcp') return false;

  const token = extractBearer(req);
  if (!core.verifyBearer(token)) {
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
    } catch (err) {
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
