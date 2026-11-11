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
import { writeExportFiles } from './export-files.js';
import { toProtocolError } from './errors.js';
import { resolveHome } from './paths.js';
import { openDatabase, describeDatabase } from './db/index.js';

const KNOWN_PROTOCOL_OPS = new Set(Object.keys(OP_SCHEMAS));

export class ServerCore {
  /**
   * @param {{ home?: string, hub?: import('../hub/browser-hub.js').BrowserHub, serverVersion?: string }} [opts]
   */
  constructor(opts = {}) {
    this.home = opts.home || resolveHome();
    this.config = loadConfig(this.home);
    this.hub = opts.hub || null;
    this.serverVersion = opts.serverVersion || '0.1.0';
    this._db = opts.db || null;
  }

  /** Opened and migrated on first use so one-shot CLI commands do not touch the database. */
  get db() {
    if (!this._db) this._db = openDatabase(this.config);
    return this._db;
  }

  close() {
    if (!this._db) return;
    const db = this._db;
    this._db = null;
    db.close();
  }

  reloadConfig() {
    this.config = loadConfig(this.home);
    return this.config;
  }

  setHub(hub) {
    this.hub = hub;
  }

  verifyBearer(token) {
    return this.verifyMcpBearer(token);
  }

  ensureAuthState() {
    const token = this.ensureActiveMcpToken();
    this.syncRegisteredBrowsers();
    return token;
  }

  verifyMcpBearer(token) {
    if (!isMcpToken(token)) return false;
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

  authorizeBrowserHello(hello, meta = {}) {
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

  audit(event) {
    return appendAudit(this.config.paths.audit, event);
  }

  readAudit(limit) {
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

  updateServerSettings(patch) {
    this.config = updateSettings(this.home, patch);
    this.audit({ action: 'settings.update', settings: this.config.settings });
    return this.config.settings;
  }

  browserEnroll(input, meta = {}) {
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

  updateBrowserPresence(session, meta = {}) {
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

  markBrowserOffline(browserId) {
    if (!browserId) return;
    this.db.run('UPDATE browsers SET status = ?, updated_at = ? WHERE browser_id = ?', [
      'offline',
      new Date().toISOString(),
      browserId
    ]);
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

  browsersBind(browserId) {
    this.#requireHub();
    const status = this.hub.bind(browserId);
    this.audit({ action: 'browsers.bind', browserId, ok: true });
    return status;
  }

  browsersStatus() {
    this.#requireHub();
    return {
      ...this.hub.status(),
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

  /**
   * @param {string} op
   * @param {string} platform
   * @param {object} args
   * @param {{ confirm?: boolean }} [mcpOpts]
   */
  async callOp(op, platform, args = {}, mcpOpts = {}) {
    this.#requireHub();
    const browser = this.hub.getBound();
    if (!browser) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'no browser bound');
    }

    if (KNOWN_PROTOCOL_OPS.has(op)) {
      const reqCheck = validateRpcRequest({ id: 'precheck', op, platform, args });
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
    } catch (err) {
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
      const data = await this.hub.rpc({ op, platform, args });
      if (op === 'chats.export') {
        const written = writeExportFiles(
          resolveExportDir(this.config),
          { platform, chatId: data?.payload?.chatId || args.chatId },
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

  chatsList(platform, args) {
    return this.callOp('chats.list', platform, args || {});
  }

  chatsGet(platform, args) {
    return this.callOp('chats.get', platform, args || {});
  }

  chatsExport(platform, args) {
    return this.callOp('chats.export', platform, args || {});
  }

  chatsCreate(platform, args) {
    return this.callOp('chats.create', platform, args || {});
  }

  chatsDelete(platform, args, mcpOpts) {
    return this.callOp('chats.delete', platform, args || {}, mcpOpts || {});
  }

  #insertMcpToken({ rotate, label }) {
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
      searchDirs: [this.home, process.cwd()]
    });
    return {
      key: token,
      id,
      fingerprint: hashed.fingerprint,
      createdAt: now,
      artifacts
    };
  }

  #requireHub() {
    if (!this.hub) {
      throw new ProtocolError(ERROR_CODES.HOST_ERROR, 'browser hub not attached');
    }
  }
}

function summarizeArgs(op, args) {
  if (!args || typeof args !== 'object') return {};
  if (op === 'chats.create') return { title: args.title, textLen: String(args.text || '').length };
  if (op === 'chats.export') return { chatId: args.chatId, formats: args.formats };
  if (op === 'chats.list') return { query: args.query, limit: args.limit };
  return { chatId: args.chatId };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export { loadConfig, saveConfig };
