import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ServerCore } from './core/server-core.js';
import { BrowserHub } from './hub/browser-hub.js';
import { handleMcpHttp } from './mcp/http.js';
import { startStdioMcp } from './mcp/stdio.js';
import { resolveHome } from './core/paths.js';
import { ALERT_CODES } from './core/logger.js';
import { createDashboardApi } from './dashboard-api.js';
import type { JobManagerOptions } from './core/jobs/job-manager.js';
import { BodyTooLargeError, isAllowedHostHeader, isAllowedOrigin, readLimitedBody } from './core/net-guard.js';

const PKG_VERSION = '0.1.0';

export interface StartServerOptions {
  home?: string;
  stdio?: boolean;
  host?: string;
  port?: number;
  dashboard?: { enabled?: boolean; username?: string; password?: string };
  jobs?: JobManagerOptions;
}

function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const body = await readLimitedBody(req);
  if (!body.length) return {};
  return JSON.parse(body.toString('utf8'));
}

function forbid(res: http.ServerResponse, message: string): void {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'FORBIDDEN', message } }));
}

export async function startServer(opts: StartServerOptions = {}) {
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
    authorizeHello: (hello: any, meta?: { remoteAddress?: string }) => core.authorizeBrowserHello(hello, meta),
    onPresence: (session, meta) => core.updateBrowserPresence(session, meta),
    onDisconnect: (browserId) => core.markBrowserOffline(browserId),
    onAudit: (event: Record<string, any>) => {
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
  core.startJobLanes(hub, opts.jobs);

  const host = opts.host || core.config.host || '127.0.0.1';
  const port = opts.port ?? core.config.port;
  core.logger.info({
    component: 'server',
    message: 'Chat Export server starting',
    host,
    port,
    version: PKG_VERSION
  });

  if (
    core.config.dashboard?.enabled !== false &&
    core.config.dashboard?.password === 'changeme' &&
    !process.env.CHAT_EXPORT_ADMIN_PASS
  ) {
    core.logger.warn({
      component: 'dashboard',
      message: 'dashboard uses the default password; set CHAT_EXPORT_ADMIN_PASS or dashboard.password in config.json'
    });
  }

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      if (!isAllowedHostHeader(req, host)) {
        forbid(res, 'host not allowed');
        return;
      }
      if (url.pathname !== '/health' && !isAllowedOrigin(req)) {
        core.audit({ action: 'http.origin', ok: false, code: 'FORBIDDEN', origin: String(req.headers.origin || ''), path: url.pathname });
        forbid(res, 'origin not allowed');
        return;
      }
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
          forbid(res, 'localhost only');
          return;
        }
        if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
          res.writeHead(415, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'application/json required' } }));
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
    } catch (err: any) {
      if (err instanceof BodyTooLargeError && !res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'request body too large' } }));
        return;
      }
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'internal error' } }));
      }
      core.audit({ action: 'http.error', ok: false, message: err?.message || String(err) });
    }
  });

  hub.attach(httpServer, {
    path: '/ws',
    verifyUpgrade: (req) => isAllowedHostHeader(req, host) && isAllowedOrigin(req)
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });

  let stdio: Awaited<ReturnType<typeof startStdioMcp>> | null = null;
  if (opts.stdio) {
    stdio = await startStdioMcp(core);
  }

  const addr = httpServer.address() as AddressInfo | string | null;
  return {
    core,
    hub,
    httpServer,
    stdio,
    host: typeof addr === 'object' && addr ? addr.address : host,
    port: typeof addr === 'object' && addr ? addr.port : port,
    startedAt,
    dashboardEnabled: core.config.dashboard?.enabled !== false,
    async close() {
      hub.close();
      if (stdio) {
        await stdio.transport.close().catch(() => {});
        await stdio.server.close().catch(() => {});
      }
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      core.close();
    }
  };
}

export { PKG_VERSION };
