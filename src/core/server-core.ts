import os from 'node:os';
import {
  ERROR_CODES,
  ProtocolError,
  validateRpcRequest,
  OP_SCHEMAS
} from '@chat-export/protocol';
import { loadConfig, saveConfig, updateSettings, resolveExportDir } from './config.js';
import {
  generateMcpToken,
  hashKey,
  isBrowserToken,
  isMcpToken,
  verifyKey,
  writeMcpTokenArtifacts
} from './keys.js';
import { appendAudit, readAuditLines } from './audit.js';
import {
  assertCreateAllowed,
  assertDestructiveAllowed,
  assertPlatformEnabled,
  assertProjectsAllowed,
  mergePlatformsList
} from './settings.js';
import { resolveExportOutDir, writeExportFiles } from './export-files.js';
import { toProtocolError } from './errors.js';
import { resolveHome } from './paths.js';
import { openDatabase, describeDatabase } from './db/index.js';
import { ChatCacheManager } from './chat-cache.js';
import { createLogger, type FileLogger } from './logger.js';
import { JobManager, clampAskTimeout, type JobManagerOptions } from './jobs/job-manager.js';
import { isTerminal } from './jobs/job-store.js';
import { loadFiles, type FileRef } from './attachments.js';
import type { BrowserHub } from '../hub/browser-hub.js';
import type { DatabaseAdapter, LoadedConfig, Row } from '../types.js';

const KNOWN_PROTOCOL_OPS = new Set(Object.keys(OP_SCHEMAS));

export interface ServerCoreOptions {
  home?: string;
  hub?: BrowserHub | null;
  serverVersion?: string;
  db?: DatabaseAdapter | null;
  logger?: FileLogger;
}

export interface CallOpOptions {
  confirm?: boolean;
}

type OpArgs = Record<string, any>;

export class ServerCore {
  home: string;
  config: LoadedConfig;
  hub: BrowserHub | null;
  serverVersion: string;
  _db: DatabaseAdapter | null;
  _chatCache: ChatCacheManager | null;
  _jobs: JobManager | null;
  logger: FileLogger;

  constructor(opts: ServerCoreOptions = {}) {
    this.home = opts.home || resolveHome();
    this.config = loadConfig(this.home);
    this.hub = opts.hub || null;
    this.serverVersion = opts.serverVersion || '0.1.0';
    this._db = opts.db || null;
    this._chatCache = null;
    this._jobs = null;
    this.logger = opts.logger || createLogger(this.config, () => this._db || null);
  }

  get jobs(): JobManager {
    if (!this._jobs) this._jobs = new JobManager(this);
    return this._jobs;
  }

  startJobLanes(hub: BrowserHub, opts?: JobManagerOptions): void {
    this.jobs.attachHub(hub);
  }

  get chatCache(): ChatCacheManager {
    if (!this._chatCache) this._chatCache = new ChatCacheManager(this.db, this);
    return this._chatCache;
  }

  /** Opened and migrated on first use so one-shot CLI commands do not touch the database. */
  get db(): DatabaseAdapter {
    if (!this._db) {
      this._db = openDatabase(this.config);
      if (this.logger) this.logger._db = () => this._db;
    }
    return this._db;
  }

  close(): void {
    if (this._jobs) {
      this._jobs.close();
      this._jobs = null;
    }
    if (!this._db) return;
    const db = this._db;
    this._db = null;
    db.close();
  }

  reloadConfig(): LoadedConfig {
    this.config = loadConfig(this.home);
    return this.config;
  }

  setHub(hub: BrowserHub | null): void {
    this.hub = hub;
  }

  verifyBearer(token: string | null | undefined): boolean {
    return this.verifyMcpBearer(token);
  }

  ensureAuthState() {
    const token = this.ensureActiveMcpToken();
    this.syncRegisteredBrowsers();
    return token;
  }

  verifyMcpBearer(token: string | null | undefined): boolean {
    if (!token || !isMcpToken(token)) return false;
    const rows = this.db.all(
      'SELECT id, salt, hash FROM mcp_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC, id DESC'
    );
    for (const row of rows) {
      if (!verifyKey(token, row)) continue;
      this.db.run('UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
      return true;
    }
    return false;
  }

  authorizeBrowserHello(hello: any, meta: { remoteAddress?: string } = {}) {
    if (!isBrowserToken(hello?.key)) return null;
    const rows = this.db.all(
      'SELECT browser_id, label, salt, hash, fingerprint, host_ip, permissions_json, status, connected_at, updated_at, tabs_json FROM browsers ORDER BY browser_id'
    );
    for (const row of rows) {
      if (!verifyKey(hello.key, row)) continue;
      if (hello.browserId && hello.browserId !== row.browser_id) {
        return null;
      }
      return {
        browserId: row.browser_id,
        browserLabel: row.label || hello.browserLabel || row.browser_id,
        fingerprint: row.fingerprint,
        hostIp: meta.remoteAddress || row.host_ip || '',
        permissions: parseJson(row.permissions_json, {
          allowCreate: true,
          allowDestructive: false,
          allowProjects: true
        }),
        tabs: parseJson(row.tabs_json, [])
      };
    }
    return null;
  }

  ensureActiveMcpToken() {
    const active = this.db.get(
      'SELECT id, fingerprint, created_at AS createdAt FROM mcp_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    if (active) return { created: false, ...active };
    const created = this.#insertMcpToken({ rotate: false, label: 'default' });
    this.audit({ action: 'mcp_token.bootstrap', keyId: created.id, fingerprint: created.fingerprint, ok: true });
    return { created: true, ...created };
  }

  keyNew() {
    const created = this.#insertMcpToken({ rotate: false, label: 'manual' });
    this.audit({ action: 'mcp_token.new', keyId: created.id, fingerprint: created.fingerprint, ok: true });
    return created;
  }

  keyRotate() {
    const created = this.#insertMcpToken({ rotate: true, label: 'rotated' });
    this.audit({ action: 'mcp_token.rotate', keyId: created.id, fingerprint: created.fingerprint, ok: true });
    return created;
  }

  keyList() {
    const rows = this.db.all(
      'SELECT id, label, fingerprint, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM mcp_tokens ORDER BY created_at DESC, id DESC'
    );
    return {
      active: rows.find((row) => !row.revokedAt) || null,
      revoked: rows.filter((row) => row.revokedAt)
    };
  }

  audit(event: Record<string, unknown>) {
    return appendAudit(this.config.paths.audit, event);
  }

  readAudit(limit?: number) {
    return readAuditLines(this.config.paths.audit, limit);
  }

  status() {
    return {
      home: this.home,
      host: this.config.host,
      port: this.config.port,
      exportDir: resolveExportDir(this.config),
      settings: this.config.settings,
      keys: this.keyList(),
      registeredBrowsers: this.config.registeredBrowsers,
      database: this._db ? this._db.describe() : describeDatabase(this.config),
      hub: this.hub ? this.hub.status() : null,
      serverVersion: this.serverVersion
    };
  }

  updateServerSettings(patch: { platformsEnabled?: string[]; allowDestructive?: boolean }) {
    this.config = updateSettings(this.home, patch);
    this.audit({ action: 'settings.update', settings: this.config.settings });
    return this.config.settings;
  }

  browserEnroll(input: any, meta: { hostIp?: string } = {}) {
    const browserId = String(input?.browserId || '').trim();
    const key = String(input?.key || '').trim();
    if (!browserId) {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'browserId is required');
    }
    if (!isBrowserToken(key)) {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'browser token must start with ceb_ or legacy cek_');
    }
    const browserLabel = String(input?.browserLabel || input?.label || browserId).trim() || browserId;
    const permissions = {
      allowCreate: input?.allowCreate === false ? false : true,
      allowDestructive: Boolean(input?.allowDestructive),
      allowProjects: input?.allowProjects === false ? false : true
    };
    const hashed = hashKey(key);
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO browsers (
         browser_id, label, salt, hash, fingerprint, host_ip, permissions_json, tabs_json, status, connected_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(browser_id) DO UPDATE SET
         label = excluded.label,
         salt = excluded.salt,
         hash = excluded.hash,
         fingerprint = excluded.fingerprint,
         host_ip = excluded.host_ip,
         permissions_json = excluded.permissions_json,
         updated_at = excluded.updated_at,
         status = CASE
           WHEN browsers.status = 'online' THEN browsers.status
           ELSE excluded.status
         END`,
      [
        browserId,
        browserLabel,
        hashed.salt,
        hashed.hash,
        hashed.fingerprint,
        meta.hostIp || '',
        JSON.stringify(permissions),
        JSON.stringify([]),
        'registered',
        null,
        now
      ]
    );
    this.audit({ action: 'browser.enroll', browserId, fingerprint: hashed.fingerprint, ok: true });
    return { browserId, browserLabel, fingerprint: hashed.fingerprint, permissions };
  }

  syncRegisteredBrowsers() {
    for (const browser of this.config.registeredBrowsers || []) {
      this.browserEnroll(browser);
    }
  }

  updateBrowserPresence(session: any, meta: { hostIp?: string } = {}): void {
    const browserId = String(session?.browserId || '').trim();
    if (!browserId) return;
    const permissions = {
      allowCreate: session.allowCreate === false ? false : true,
      allowDestructive: Boolean(session.allowDestructive),
      allowProjects: session.allowProjects === false ? false : true
    };
    const tabs = Array.isArray(session.tabs) ? session.tabs : [];
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE browsers
          SET label = ?,
              host_ip = COALESCE(NULLIF(?, ''), host_ip),
              permissions_json = ?,
              tabs_json = ?,
              status = ?,
              connected_at = COALESCE(connected_at, ?),
              updated_at = ?
        WHERE browser_id = ?`,
      [
        session.browserLabel || browserId,
        meta.hostIp || '',
        JSON.stringify(permissions),
        JSON.stringify(tabs),
        session.status || 'online',
        session.connectedAt || now,
        now,
        browserId
      ]
    );
  }

  markBrowserOffline(browserId: string | null | undefined): void {
    if (!browserId) return;
    this.db.run('UPDATE browsers SET status = ?, updated_at = ? WHERE browser_id = ?', [
      'offline',
      new Date().toISOString(),
      browserId
    ]);
    this.logger.alert({
      component: 'ws',
      code: 'WS_DISCONNECT',
      message: 'Browser WebSocket disconnected',
      browser_id: browserId
    });
  }

  browsersList() {
    const live = new Map((this.hub ? this.hub.listBrowsers() : []).map((browser) => [browser.browserId, browser]));
    const rows = this.db.all(
      'SELECT browser_id, label, fingerprint, host_ip, permissions_json, tabs_json, status, connected_at, updated_at FROM browsers ORDER BY browser_id'
    );
    return rows.map((row) => {
      const browserId = row.browser_id;
      const connected = live.get(browserId);
      const permissions = parseJson(row.permissions_json, {
        allowCreate: true,
        allowDestructive: false,
        allowProjects: true
      });
      const tabs = parseJson(row.tabs_json, []);
      return {
        browserId,
        browserLabel: connected?.browserLabel || row.label || browserId,
        fingerprint: row.fingerprint || null,
        hostIp: row.host_ip || '',
        platformsEnabled: connected?.platformsEnabled || [],
        allowCreate: connected?.allowCreate ?? permissions.allowCreate,
        allowDestructive: connected?.allowDestructive ?? permissions.allowDestructive,
        allowProjects: connected?.allowProjects ?? permissions.allowProjects,
        tabs: connected?.tabs || tabs,
        connectedAt: connected?.connectedAt || row.connected_at || null,
        updatedAt: row.updated_at || null,
        status: connected ? 'online' : row.status || 'registered',
        bound: Boolean(connected?.bound)
      };
    });
  }

  browsersBind(browserId: string) {
    const hub = this.#requireHub();
    const status = hub.bind(browserId);
    this.audit({ action: 'browsers.bind', browserId, ok: true });
    return status;
  }

  browsersStatus() {
    const hub = this.#requireHub();
    return {
      ...hub.status(),
      browsers: this.browsersList()
    };
  }

  platformsList() {
    const browser = this.hub ? this.hub.getBound() : null;
    return {
      server: this.config.settings,
      platforms: mergePlatformsList(this.config.settings, browser),
      browser: browser
        ? {
            browserId: browser.browserId,
            platformsEnabled: browser.platformsEnabled,
            allowCreate: browser.allowCreate,
            allowDestructive: browser.allowDestructive,
            allowProjects: browser.allowProjects,
            tabs: browser.tabs
          }
        : null
    };
  }

  async callOp(op: string, platform: string, args: OpArgs = {}, mcpOpts: CallOpOptions = {}): Promise<any> {
    const hub = this.#requireHub();
    const browser = hub.getBound();
    if (!browser) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'no browser bound');
    }

    let rpcArgs = args;
    let exportRoot = resolveExportDir(this.config);
    if (op === 'chats.export' && args && typeof args === 'object') {
      const raw = args as Record<string, unknown>;
      if (raw.outDir !== undefined && String(raw.outDir).trim() !== '') {
        exportRoot = resolveExportOutDir(String(raw.outDir), os.homedir(), [this.home, exportRoot]);
      }
      const { outDir: _drop, ...rest } = raw;
      rpcArgs = rest;
    }

    if (KNOWN_PROTOCOL_OPS.has(op)) {
      const reqCheck = validateRpcRequest({ id: 'precheck', op, platform, args: rpcArgs });
      if (!reqCheck.valid) {
        throw new ProtocolError(
          ERROR_CODES.BAD_REQUEST,
          reqCheck.errors.map((e) => e.path + ' ' + e.message).join('; ')
        );
      }
    }

    assertPlatformEnabled(platform, this.config.settings, browser);

    try {
      assertCreateAllowed(op, browser);
      assertProjectsAllowed(op, browser, { confirm: mcpOpts.confirm });
      assertDestructiveAllowed(op, this.config.settings, browser, { confirm: mcpOpts.confirm });
    } catch (err: any) {
      this.audit({
        action: op,
        platform,
        args: summarizeArgs(op, args),
        ok: false,
        code: err.code,
        confirm: Boolean(mcpOpts.confirm)
      });
      throw err;
    }

    try {
      const data = await hub.rpc({ op, platform, args: rpcArgs });
      if (op === 'chats.export') {
        const written = writeExportFiles(
          exportRoot,
          { platform, chatId: data?.payload?.chatId || rpcArgs.chatId },
          data.files || []
        );
        const result = {
          paths: written.files.map((f) => f.path),
          dir: written.dir,
          files: written.files,
          payload: data.payload
        };
        this.audit({
          action: op,
          platform,
          chatId: args.chatId,
          ok: true,
          paths: result.paths
        });
        return result;
      }

      this.audit({
        action: op,
        platform,
        args: summarizeArgs(op, args),
        ok: true
      });
      return data;
    } catch (err) {
      const pe = toProtocolError(err);
      this.audit({
        action: op,
        platform,
        args: summarizeArgs(op, args),
        ok: false,
        code: pe.code,
        message: pe.message
      });
      throw pe;
    }
  }

  async chatsList(platform: string, args?: OpArgs) {
    const input = args && typeof args === 'object' ? { ...args } : {};
    const includeProjectChats = input.includeProjectChats !== false;
    delete input.includeProjectChats;
    const base = await this.callOp('chats.list', platform, input);
    if (!includeProjectChats) return base;
    return mergeProjectChats(this, platform, base);
  }

  containersList(platform: string, args?: OpArgs) {
    return this.callOp('containers.list', platform, args || {});
  }

  containersChats(platform: string, args?: OpArgs) {
    return this.callOp('containers.chats', platform, args || {});
  }

  containersCreate(platform: string, args?: OpArgs) {
    return this.callOp('containers.create', platform, args || {});
  }

  containersDelete(platform: string, args?: OpArgs, mcpOpts?: CallOpOptions) {
    return this.callOp('containers.delete', platform, args || {}, mcpOpts || {});
  }

  containersMoveChat(platform: string, args?: OpArgs) {
    return this.callOp('containers.move_chat', platform, args || {});
  }

  chatsGet(platform: string, args?: OpArgs) {
    return this.callOp('chats.get', platform, args || {});
  }

  chatsExport(platform: string, args?: OpArgs) {
    return this.callOp('chats.export', platform, args || {});
  }

  chatsCreate(platform: string, args?: OpArgs) {
    const input = args && typeof args === 'object' ? this.#withLoadedFiles({ ...args }) : {};
    return this.callOp('chats.create', platform, input);
  }

  chatsSend(platform: string, args?: OpArgs) {
    const input = args && typeof args === 'object' ? this.#withLoadedFiles({ ...args }) : {};
    return this.callOp('chats.send', platform, input);
  }

  async resolveChatId(platform: string, chatId: string): Promise<string> {
    const id = String(chatId || '').trim();
    if (!id) throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'chatId required');
    try {
      await this.chatsGet(platform, { chatId: id });
      return id;
    } catch (err: any) {
      const code = err?.code;
      if (code !== ERROR_CODES.NOT_FOUND && code !== ERROR_CODES.HOST_ERROR && code !== ERROR_CODES.TIMEOUT) {
        throw err;
      }
    }
    const page = await this.chatsList(platform, { query: id, limit: 30 });
    for (const item of page?.items || []) {
      if (item?.chatId === id) return id;
      if (item?.title && String(item.title).includes(id)) return String(item.chatId);
    }
    throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'chat not found: ' + id);
  }

  #withLoadedFiles(args: OpArgs): OpArgs {
    if (!Array.isArray(args.files) || !args.files.length) return args;
    const first = args.files[0];
    if (!first || typeof first !== 'object' || !('path' in first)) return args;
    return { ...args, files: loadFiles(args.files as FileRef[], { home: this.home }) };
  }

  chatsDelete(platform: string, args?: OpArgs, mcpOpts?: CallOpOptions) {
    return this.callOp('chats.delete', platform, args || {}, mcpOpts || {});
  }

  chatOutline(platform: string, args?: OpArgs) {
    return this.chatCache.chatOutline(platform, args || {});
  }

  chatRead(platform: string, args?: OpArgs) {
    return this.chatCache.chatRead(platform, args || {});
  }

  async chatAsk(args: OpArgs = {}) {
    const platform = String(args.platform || '').trim();
    const prompt = String(args.prompt || '').trim();
    if (!platform) throw new ProtocolError(ERROR_CODES.INVALID_ARGS, 'platform required');
    if (!prompt) throw new ProtocolError(ERROR_CODES.INVALID_ARGS, 'prompt required');
    const wait = args.wait !== false;
    const spec: OpArgs = { kind: 'ask', platform, prompt };
    const passthrough = ['chatId', 'browserId', 'timeout_s', 'title', 'model', 'mode', 'toggles', 'tools', 'files'] as const;
    for (const k of passthrough) {
      if (args[k] !== undefined) spec[k] = args[k];
    }
    const enqueued = this.jobs.enqueue(spec as Parameters<JobManager['enqueue']>[0]);
    if (!wait) {
      return { ...enqueued, status: enqueued.status || 'queued' };
    }
    const timeoutMs = (clampAskTimeout(spec.timeout_s) + 60) * 1000;
    const done = await this.jobs.waitFor(enqueued.job_id, timeoutMs);
    if (!done || !isTerminal(done.status)) {
      throw new ProtocolError(ERROR_CODES.TIMEOUT, 'chat_ask wait timed out', { job_id: enqueued.job_id });
    }
    if (done.status === 'error') {
      const code = done.error?.code || ERROR_CODES.HOST_ERROR;
      throw new ProtocolError(code, done.error?.message || 'ask failed', done.error || undefined);
    }
    if (done.status === 'cancelled') {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'ask cancelled', { job_id: done.id });
    }
    return { job_id: done.id, status: done.status, ...(done.result || {}) };
  }

  chatCacheSync(args?: OpArgs) {
    return this.chatCache.sync(args || {});
  }

  chatCacheRead(args?: OpArgs) {
    return this.chatCache.read(args || {});
  }

  chatCacheAppend(args?: OpArgs) {
    return this.chatCache.append(args || {});
  }

  chatCacheUpdateBlock(args?: OpArgs) {
    return this.chatCache.updateBlock(args || {});
  }

  chatCacheDelete(args?: OpArgs) {
    return this.chatCache.remove(args || {});
  }

  mcpErrorContext(platform?: string | null) {
    const browser = this.hub ? this.hub.getBound() : null;
    const browserId = browser?.browserId || null;
    let activeTabsOnPlatform: any[] = [];
    if (browser?.tabs && platform) {
      activeTabsOnPlatform = browser.tabs.filter((tab) => tab.platform === platform);
    }
    const permissions = browser
      ? {
          allowCreate: browser.allowCreate !== false,
          allowDestructive: Boolean(browser.allowDestructive),
          allowProjects: browser.allowProjects !== false
        }
      : null;
    return {
      browserId,
      platform: platform || null,
      activeTabsOnPlatform,
      permissions,
      recentAlerts: this.logger.recentAlerts(8)
    };
  }

  logMcpToolResult(
    tool: string,
    {
      platform,
      duration_ms,
      ok,
      code,
      message,
      detail
    }: {
      platform?: string | null;
      duration_ms?: number;
      ok?: boolean;
      code?: string | null;
      message?: string;
      detail?: unknown;
    }
  ): void {
    const browser = this.hub ? this.hub.getBound() : null;
    this.logger.metric({
      component: 'mcp',
      tool,
      platform: platform || null,
      browser_id: browser?.browserId || null,
      duration_ms,
      ok,
      code: code || null,
      message: message || '',
      detail
    });
  }

  #insertMcpToken({ rotate, label }: { rotate: boolean; label?: string }) {
    const token = generateMcpToken();
    const hashed = hashKey(token);
    const now = new Date().toISOString();
    const id = 'mcp_' + hashed.fingerprint;
    this.db.transaction((db) => {
      if (rotate) {
        db.run('UPDATE mcp_tokens SET revoked_at = ? WHERE revoked_at IS NULL', [now]);
      }
      db.run(
        'INSERT INTO mcp_tokens (id, label, salt, hash, fingerprint, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, label || 'default', hashed.salt, hashed.hash, hashed.fingerprint, now, null, null]
      );
    });
    const artifacts = writeMcpTokenArtifacts(this.home, token, {
      searchDirs: [process.cwd()]
    });
    return {
      key: token,
      id,
      fingerprint: hashed.fingerprint,
      createdAt: now,
      artifacts
    };
  }

  #requireHub(): BrowserHub {
    if (!this.hub) {
      throw new ProtocolError(ERROR_CODES.HOST_ERROR, 'browser hub not attached');
    }
    return this.hub;
  }
}

function summarizeArgs(op: string, args: any): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  if (op === 'chats.create') return { title: args.title, textLen: String(args.text || '').length };
  if (op === 'chats.export') return { chatId: args.chatId, formats: args.formats };
  if (op === 'chats.list') {
    return {
      query: args.query,
      limit: args.limit,
      includeProjectChats: args.includeProjectChats,
      containerId: args.containerId
    };
  }
  if (op === 'containers.list') return { query: args.query, limit: args.limit };
  if (op === 'containers.chats') return { containerId: args.containerId, limit: args.limit };
  if (op === 'containers.create') return { name: args.name };
  if (op === 'containers.delete') return { containerId: args.containerId, name: args.name };
  if (op === 'containers.move_chat') {
    return { chatId: args.chatId, containerId: args.containerId };
  }
  return { chatId: args.chatId };
}

async function mergeProjectChats(core: ServerCore, platform: string, base: any) {
  const items = [...(base?.items || [])];
  const seen = new Set<string>(items.map((c: any) => c?.chatId).filter(Boolean));
  let containers: any;
  try {
    containers = await core.callOp('containers.list', platform, { limit: 100 });
  } catch {
    return base;
  }
  for (const container of containers?.items || []) {
    if (!container?.containerId) continue;
    let cursor: string | null = null;
    do {
      const pageArgs: OpArgs = { containerId: container.containerId, limit: 100 };
      if (cursor) pageArgs.cursor = cursor;
      let page: any;
      try {
        page = await core.callOp('containers.chats', platform, pageArgs);
      } catch {
        break;
      }
      for (const chat of page?.items || []) {
        if (!chat?.chatId || seen.has(chat.chatId)) continue;
        seen.add(chat.chatId);
        items.push({
          ...chat,
          containerType: chat.containerType || container.containerType || 'project',
          containerId: chat.containerId || container.containerId,
          containerTitle: chat.containerTitle || container.title
        });
      }
      const next = page?.nextCursor || null;
      cursor = next && next !== cursor ? next : null;
    } while (cursor);
  }
  return { items, nextCursor: base?.nextCursor ?? null };
}

function parseJson(value: unknown, fallback: any): any {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export { loadConfig, saveConfig };
