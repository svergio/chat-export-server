import http from 'node:http';
import { ServerCore } from './core/server-core.js';
import { BrowserHub } from './hub/browser-hub.js';
import { handleMcpHttp } from './mcp/http.js';
import { startStdioMcp } from './mcp/stdio.js';
import { resolveHome } from './core/paths.js';
import { ALERT_CODES } from './core/logger.js';
import { createDashboardApi } from './dashboard-api.js';

const PKG_VERSION = '0.1.0';

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * @param {{
 *   home?: string,
 *   stdio?: boolean,
 *   host?: string,
 *   port?: number,
 *   dashboard?: { enabled?: boolean, username?: string, password?: string }
 * }} [opts]
 */
export async function startServer(opts = {}) {
  const home = opts.home || resolveHome();
  const core = new ServerCore({ home, serverVersion: PKG_VERSION });
  if (opts.dashboard) {
    core.config.dashboard = {
      ...core.config.dashboard,
      ...(opts.dashboard.enabled !== undefined ? { enabled: Boolean(opts.dashboard.enabled) } : {}),
      ...(opts.dashboard.username ? { username: opts.dashboard.username } : {}),
      ...(opts.dashboard.password !== undefined ? { password: opts.dashboard.password } : {})
    };
  }
  core.ensureAuthState();
  const startedAt = Date.now();
  const handleDashboard = createDashboardApi({ core, startedAt });
  const hub = new BrowserHub({
    serverVersion: PKG_VERSION,
    rpcTimeoutMs: core.config.rpcTimeoutMs,
    authorizeHello: (hello, meta) => core.authorizeBrowserHello(hello, meta),
    onPresence: (session, meta) => core.updateBrowserPresence(session, meta),
    onDisconnect: (browserId) => core.markBrowserOffline(browserId),
    onAudit: (event) => {
      core.audit(event);
      if (event?.ok === false && event?.code && ALERT_CODES.has(event.code)) {
        core.logger.alert({
          component: event.action?.startsWith('ws') ? 'ws' : 'hub',
          code: event.code,
          message: event.message || event.action || 'hub alert',
          browser_id: event.browserId || null,
          detail: { action: event.action }
        });
      }
    }
  });
  core.setHub(hub);

  const host = opts.host || core.config.host || '127.0.0.1';
  const port = opts.port ?? core.config.port;
  core.logger.info({
    component: 'server',
    message: 'Chat Export server starting',
    host,
    port,
    version: PKG_VERSION
  });

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version: PKG_VERSION }));
        return;
      }
      if (url.pathname === '/enroll') {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' } }));
          return;
        }
        if (!isLoopbackAddress(req.socket.remoteAddress || '')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'localhost only' } }));
          return;
        }
        const body = await readJsonBody(req);
        const enrolled = core.browserEnroll(body, { hostIp: req.socket.remoteAddress || '' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, browser: enrolled }));
        return;
      }
      if (await handleMcpHttp(req, res, core, url)) return;
      if (await handleDashboard(req, res, url)) return;
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
    port: typeof addr === 'object' && addr ? addr.port :     port,
    startedAt,
    dashboardEnabled: core.config.dashboard?.enabled !== false,
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
