import http from 'node:http';
import { ServerCore } from './core/server-core.js';
import { BrowserHub } from './hub/browser-hub.js';
import { handleMcpHttp } from './mcp/http.js';
import { startStdioMcp } from './mcp/stdio.js';
import { resolveHome } from './core/paths.js';

const PKG_VERSION = '0.1.0';

/**
 * @param {{ home?: string, stdio?: boolean, host?: string, port?: number }} [opts]
 */
export async function startServer(opts = {}) {
  const home = opts.home || resolveHome();
  const core = new ServerCore({ home, serverVersion: PKG_VERSION });
  const hub = new BrowserHub({
    serverVersion: PKG_VERSION,
    rpcTimeoutMs: core.config.rpcTimeoutMs,
    verifyKey: (key) => core.verifyBearer(key),
    onAudit: (event) => core.audit(event)
  });
  core.setHub(hub);

  const host = opts.host || core.config.host || '127.0.0.1';
  const port = opts.port ?? core.config.port;

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version: PKG_VERSION }));
        return;
      }
      if (await handleMcpHttp(req, res, core, url)) return;
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'internal error' } }));
      }
      core.audit({ action: 'http.error', ok: false, message: err?.message || String(err) });
    }
  });

  hub.attach(httpServer, { path: '/ws' });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });

  let stdio = null;
  if (opts.stdio) {
    stdio = await startStdioMcp(core);
  }

  const addr = httpServer.address();
  return {
    core,
    hub,
    httpServer,
    stdio,
    host: typeof addr === 'object' && addr ? addr.address : host,
    port: typeof addr === 'object' && addr ? addr.port : port,
    async close() {
      hub.close();
      if (stdio) {
        await stdio.transport.close().catch(() => {});
        await stdio.server.close().catch(() => {});
      }
      await new Promise((resolve) => httpServer.close(() => resolve()));
      core.close();
    }
  };
}

export { PKG_VERSION };
