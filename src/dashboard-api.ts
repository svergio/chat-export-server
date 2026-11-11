import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProtocolError } from '@chat-export/protocol';
import { JobStore, isTerminal, type JobRecord } from './core/jobs/job-store.js';
import type { ServerCore } from './core/server-core.js';
import { BodyTooLargeError, LoginThrottle, readLimitedBody } from './core/net-guard.js';

type JsonBody = Record<string, any>;
type Session = { username: string; expiresAt: number };

const SESSION_COOKIE = 'ce_dash_sid';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PUBLIC = path.join(MODULE_DIR, '..', 'dashboard', 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
};

const CRED_COMPARE_SALT = 'chat-export-dashboard-cred-v1';
const CRED_COMPARE_KEYLEN = 32;

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.scryptSync(a, CRED_COMPARE_SALT, CRED_COMPARE_KEYLEN);
  const hb = crypto.scryptSync(b, CRED_COMPARE_SALT, CRED_COMPARE_KEYLEN);
  return crypto.timingSafeEqual(ha, hb);
}

function clientErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ProtocolError ? err.message : fallback;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header || typeof header !== 'string') return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function setSessionCookie(res: ServerResponse, sid: string, { secure = false }: { secure?: boolean } = {}): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sid)}`,
    'HttpOnly',
    'Path=/dashboard',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/dashboard; Max-Age=0; SameSite=Strict`);
}

async function readJsonBody(req: IncomingMessage): Promise<JsonBody | null> {
  const body = await readLimitedBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
}

function dashboardEnabled(core: ServerCore): boolean {
  return core.config.dashboard?.enabled !== false;
}

function collectProcessResources(uptimeMs: number, dbInfo: Record<string, unknown>): {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  dbSizeBytes: number;
  walSizeBytes: number;
  loadAvg: number[];
  uptimeMs: number;
} {
  const mem = process.memoryUsage();
  const dbFile = typeof dbInfo.file === 'string' ? dbInfo.file : null;
  let dbSizeBytes = 0;
  let walSizeBytes = 0;
  if (dbFile && dbFile !== ':memory:') {
    try {
      if (fs.existsSync(dbFile)) dbSizeBytes = fs.statSync(dbFile).size;
      const wal = `${dbFile}-wal`;
      if (fs.existsSync(wal)) walSizeBytes = fs.statSync(wal).size;
    } catch {
      /* ignore stat errors */
    }
  }
  return {
    rssMb: Math.round((mem.rss / 1048576) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / 1048576) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / 1048576) * 10) / 10,
    dbSizeBytes,
    walSizeBytes,
    loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    uptimeMs
  };
}

function jobSummary(job: JobRecord | null) {
  if (!job) return null;
  const rest: Record<string, any> = {
    job_id: job.id,
    kind: job.kind,
    browserId: job.browserId,
    platform: job.platform,
    status: job.status,
    progress: job.progress,
    error: job.error,
    attempts: job.attempts,
    cancelRequested: Boolean(job.cancelRequested),
    retryAt: job.retryAt || null,
    chatId: job.result?.chatId || job.state?.chatId || job.input?.chatId || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
  const result = job.result;
  if (result && typeof result === 'object') {
    rest.resultSummary = {
      status: result.status,
      total: result.total,
      ok: result.ok,
      failed: result.failed,
      paths: Array.isArray(result.paths) ? result.paths.length : undefined
    };
  }
  return rest;
}

export type DashboardHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;

export function createDashboardApi(deps: { core: ServerCore; startedAt: number }): DashboardHandler {
  const { core, startedAt } = deps;
  const sessions = new Map<string, Session>();
  const loginThrottle = new LoginThrottle();
  let jobStore: JobStore | null = null;

  function getJobStore(): JobStore {
    if (!jobStore) jobStore = new JobStore(core.db);
    return jobStore;
  }

  function getSession(req: IncomingMessage): Session | null {
    const sid = parseCookies(req)[SESSION_COOKIE];
    if (!sid) return null;
    const row = sessions.get(sid);
    if (!row || row.expiresAt < Date.now()) {
      sessions.delete(sid);
      return null;
    }
    return row;
  }

  function requireSession(req: IncomingMessage, res: ServerResponse): Session | null {
    const session = getSession(req);
    if (!session) {
      jsonResponse(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'dashboard login required' } });
      return null;
    }
    return session;
  }

  function checkCredentials(username: string, password: string): boolean {
    const dash = core.config.dashboard || {};
    const wantUser = dash.username || 'admin';
    const wantPass = dash.password || 'changeme';
    const userOk = safeEqual(username, wantUser);
    const passOk = safeEqual(password, wantPass);
    return userOk && passOk;
  }

  function serveStatic(urlPath: string, res: ServerResponse): boolean {
    let rel = urlPath.replace(/^\/dashboard\/?/, '') || 'index.html';
    if (rel.includes('..')) {
      jsonResponse(res, 400, { error: { message: 'bad path' } });
      return true;
    }
    const filePath = path.resolve(DASHBOARD_PUBLIC, rel);
    if (!filePath.startsWith(path.resolve(DASHBOARD_PUBLIC) + path.sep)) {
      jsonResponse(res, 403, { error: { message: 'forbidden' } });
      return true;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const indexPath = path.join(DASHBOARD_PUBLIC, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'], ...SECURITY_HEADERS });
        res.end(fs.readFileSync(indexPath));
        return true;
      }
      jsonResponse(res, 404, { error: { message: 'not found' } });
      return true;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', ...SECURITY_HEADERS });
    res.end(fs.readFileSync(filePath));
    return true;
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const pathname = url.pathname;

    if (pathname === '/dashboard/api/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body === null) {
        jsonResponse(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'invalid JSON' } });
        return true;
      }
      const username = String(body.username || '').trim();
      const password = String(body.password ?? '');
      const retryMs = loginThrottle.retryAfterMs('login');
      if (retryMs > 0) {
        core.audit({ action: 'dashboard.login', ok: false, code: 'RATE_LIMITED' });
        res.setHeader('Retry-After', String(Math.ceil(retryMs / 1000)));
        jsonResponse(res, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'too many failed logins' } });
        return true;
      }
      if (!checkCredentials(username, password)) {
        loginThrottle.fail('login');
        core.audit({ action: 'dashboard.login', ok: false, username });
        jsonResponse(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'invalid credentials' } });
        return true;
      }
      loginThrottle.success('login');
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { username, expiresAt: Date.now() + SESSION_TTL_MS });
      setSessionCookie(res, sid);
      core.audit({ action: 'dashboard.login', ok: true, username });
      jsonResponse(res, 200, { ok: true, username });
      return true;
    }

    if (pathname === '/dashboard/api/logout' && req.method === 'POST') {
      const sid = parseCookies(req)[SESSION_COOKIE];
      if (sid) sessions.delete(sid);
      clearSessionCookie(res);
      jsonResponse(res, 200, { ok: true });
      return true;
    }

    if (!requireSession(req, res)) return true;

    if (pathname === '/dashboard/api/overview' && req.method === 'GET') {
      const uptimeMs = Date.now() - startedAt;
      const dbInfo = core.db.describe();
      const toolStats = core.db.all(
        `SELECT tool,
                SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_count,
                SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS err_count,
                COUNT(*) AS calls,
                AVG(duration_ms) AS avg_ms
           FROM metrics_log
          WHERE component = 'mcp' AND tool IS NOT NULL
          GROUP BY tool
          ORDER BY calls DESC`
      );
      const queueRows = core.db.all('SELECT status, COUNT(*) AS count FROM jobs GROUP BY status');
      const queue = Object.fromEntries(queueRows.map((r) => [r.status, r.count]));
      const hub = core.hub ? core.hub.status() : null;
      jsonResponse(res, 200, {
        ok: true,
        uptimeMs,
        startedAt: new Date(startedAt).toISOString(),
        version: core.serverVersion,
        database: dbInfo,
        dashboard: { enabled: dashboardEnabled(core) },
        mcpToolStats: toolStats.map((r) => ({
          tool: r.tool,
          calls: r.calls,
          okCount: r.ok_count,
          errCount: r.err_count,
          avgMs: r.avg_ms != null ? Math.round(Number(r.avg_ms)) : null
        })),
        queue,
        hub,
        resources: collectProcessResources(uptimeMs, dbInfo as Record<string, unknown>)
      });
      return true;
    }

    if (pathname === '/dashboard/api/browsers' && req.method === 'GET') {
      jsonResponse(res, 200, { ok: true, browsers: core.browsersList() });
      return true;
    }

    if (pathname === '/dashboard/api/browsers/enroll' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body === null) {
        jsonResponse(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'invalid JSON' } });
        return true;
      }
      try {
        const enrolled = core.browserEnroll(body, { hostIp: req.socket?.remoteAddress || '' });
        jsonResponse(res, 200, { ok: true, browser: enrolled });
      } catch (err: any) {
        const mapped = err instanceof ProtocolError ? err : null;
        jsonResponse(res, 400, {
          ok: false,
          error: { code: mapped?.code || 'BAD_REQUEST', message: clientErrorMessage(err, 'enroll failed') }
        });
      }
      return true;
    }

    if (pathname === '/dashboard/api/browsers/bind' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body === null) {
        jsonResponse(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'invalid JSON' } });
        return true;
      }
      const browserId = String(body.browserId || '').trim();
      if (!browserId) {
        jsonResponse(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'browserId required' } });
        return true;
      }
      try {
        const status = core.browsersBind(browserId);
        jsonResponse(res, 200, { ok: true, ...status });
      } catch (err: any) {
        const mapped = err instanceof ProtocolError ? err : null;
        jsonResponse(res, 400, {
          ok: false,
          error: { code: mapped?.code || 'BAD_REQUEST', message: clientErrorMessage(err, 'bind failed') }
        });
      }
      return true;
    }

    if (pathname === '/dashboard/api/mcp-token' && req.method === 'GET') {
      const keys = core.keyList();
      jsonResponse(res, 200, {
        ok: true,
        active: keys.active
          ? {
              id: keys.active.id,
              label: keys.active.label,
              fingerprint: keys.active.fingerprint,
              createdAt: keys.active.createdAt,
              lastUsedAt: keys.active.lastUsedAt
            }
          : null,
        revokedCount: keys.revoked?.length || 0
      });
      return true;
    }

    if (pathname === '/dashboard/api/mcp-token/rotate' && req.method === 'POST') {
      const rotated = core.keyRotate();
      jsonResponse(res, 200, {
        ok: true,
        id: rotated.id,
        fingerprint: rotated.fingerprint,
        createdAt: rotated.createdAt,
        token: rotated.key,
        artifacts: rotated.artifacts
      });
      return true;
    }

    if (pathname === '/dashboard/api/jobs' && req.method === 'GET') {
      const filter = {
        status: url.searchParams.get('status') || undefined,
        browserId: url.searchParams.get('browserId') || undefined,
        kind: url.searchParams.get('kind') || undefined,
        limit: url.searchParams.get('limit') || undefined
      };
      const store = getJobStore();
      const jobs = store.list({
        status: filter.status,
        browserId: filter.browserId,
        kind: filter.kind,
        limit: filter.limit === undefined ? undefined : Number(filter.limit)
      });
      jsonResponse(res, 200, { ok: true, jobs: jobs.map(jobSummary), count: jobs.length });
      return true;
    }

    if (pathname === '/dashboard/api/jobs/cancel' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body === null) {
        jsonResponse(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'invalid JSON' } });
        return true;
      }
      const jobId = String(body.jobId || body.job_id || '').trim();
      if (!jobId) {
        jsonResponse(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'jobId required' } });
        return true;
      }
      const store = getJobStore();
      const job = store.get(jobId);
      if (!job) {
        jsonResponse(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'job not found' } });
        return true;
      }
      if (isTerminal(job.status)) {
        jsonResponse(res, 200, { ok: true, job_id: jobId, status: job.status, cancelled: false });
        return true;
      }
      if (job.status === 'queued') {
        store.update(jobId, { status: 'cancelled', cancelRequested: true });
        core.audit({ action: 'jobs.cancel', job_id: jobId, ok: true, via: 'dashboard' });
        jsonResponse(res, 200, { ok: true, job_id: jobId, status: 'cancelled', cancelled: true });
        return true;
      }
      store.update(jobId, { cancelRequested: true });
      core.audit({ action: 'jobs.cancel', job_id: jobId, ok: true, via: 'dashboard', requested: true });
      jsonResponse(res, 200, {
        ok: true,
        job_id: jobId,
        status: store.get(jobId)?.status,
        cancelled: 'requested'
      });
      return true;
    }

    if (pathname === '/dashboard/api/cache' && req.method === 'GET') {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
      const rows = core.db.all(
        `SELECT cache_id AS cacheId, browser_id AS browserId, platform, chat_id AS chatId, title,
                total_turns AS totalTurns, total_chars AS totalChars, updated_at AS updatedAt, created_at AS createdAt
           FROM cached_chats
          ORDER BY updated_at DESC
          LIMIT ?`,
        [limit]
      );
      jsonResponse(res, 200, { ok: true, caches: rows, count: rows.length });
      return true;
    }

    const cacheDetailMatch = /^\/dashboard\/api\/cache\/([^/]+)$/.exec(pathname);
    if (cacheDetailMatch && req.method === 'GET') {
      const cacheId = decodeURIComponent(cacheDetailMatch[1]);
      const row = core.db.get(
        `SELECT cache_id AS cacheId, browser_id AS browserId, platform, chat_id AS chatId, title, model,
                total_turns AS totalTurns, total_chars AS totalChars, meta_json AS metaJson,
                created_at AS createdAt, updated_at AS updatedAt
           FROM cached_chats WHERE cache_id = ?`,
        [cacheId]
      );
      if (!row) {
        jsonResponse(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'cache not found' } });
        return true;
      }
      const blockStats = core.db.get(
        'SELECT COUNT(*) AS blocks, MAX(revision) AS maxRevision FROM cached_chat_blocks WHERE cache_id = ?',
        [cacheId]
      );
      let meta = null;
      if (row.metaJson) {
        try {
          meta = JSON.parse(row.metaJson);
        } catch {
          meta = null;
        }
      }
      jsonResponse(res, 200, {
        ok: true,
        cache: {
          ...row,
          metaJson: undefined,
          meta,
          blocks: blockStats?.blocks || 0,
          maxRevision: blockStats?.maxRevision || null
        }
      });
      return true;
    }

    if (cacheDetailMatch && req.method === 'DELETE') {
      const cacheId = decodeURIComponent(cacheDetailMatch[1]);
      const row = core.db.get('SELECT platform, chat_id FROM cached_chats WHERE cache_id = ?', [cacheId]);
      if (!row) {
        jsonResponse(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'cache not found' } });
        return true;
      }
      try {
        const result = core.chatCacheDelete({ cacheId, platform: row.platform, chatId: row.chat_id });
        jsonResponse(res, 200, { ok: true, ...result });
      } catch (err: any) {
        const mapped = err instanceof ProtocolError ? err : null;
        jsonResponse(res, 400, {
          ok: false,
          error: { code: mapped?.code || 'BAD_REQUEST', message: clientErrorMessage(err, 'delete failed') }
        });
      }
      return true;
    }

    if (pathname === '/dashboard/api/logs' && req.method === 'GET') {
      const type = url.searchParams.get('type') === 'alerts' ? 'alerts' : 'server';
      const lines = Math.min(500, Math.max(1, Number(url.searchParams.get('lines')) || 100));
      const entries = core.logger.tail(lines, type === 'alerts');
      jsonResponse(res, 200, { ok: true, type, lines: entries.length, entries });
      return true;
    }

    jsonResponse(res, 404, { error: { message: 'not found' } });
    return true;
  }

  // Resolves true when the request was handled.
  return async function handleDashboard(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/dashboard')) return false;

    if (!dashboardEnabled(core)) {
      if (url.pathname.startsWith('/dashboard/api/')) {
        jsonResponse(res, 404, { ok: false, error: { code: 'HEADLESS', message: 'headless mode' } });
      } else {
        jsonResponse(res, 404, { ok: false, error: { code: 'HEADLESS', message: 'dashboard disabled (headless mode)' } });
      }
      return true;
    }

    if (url.pathname.startsWith('/dashboard/api/')) {
      return handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      jsonResponse(res, 405, { error: { message: 'method not allowed' } });
      return true;
    }

    return serveStatic(url.pathname, res);
  };
}
