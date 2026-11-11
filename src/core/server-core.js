import {
  ERROR_CODES,
  ProtocolError,
  validateRpcRequest,
  DESTRUCTIVE_OPS
} from '@chat-export/protocol';
import { loadConfig, saveConfig, updateSettings, resolveExportDir } from './config.js';
import {
  createOrReplaceKey,
  listKeyMeta,
  verifyAgainstStore
} from './keys.js';
import { appendAudit, readAuditLines } from './audit.js';
import { assertPlatformEnabled, assertDestructiveAllowed, mergePlatformsList } from './settings.js';
import { writeExportFiles } from './export-files.js';
import { toProtocolError } from './errors.js';
import { resolveHome } from './paths.js';
import { openDatabase, describeDatabase } from './db/index.js';

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
    if (!token) return false;
    return verifyAgainstStore(token, this.config.paths.keys);
  }

  keyNew() {
    const { key, record } = createOrReplaceKey(this.config.paths.keys, { rotate: false });
    this.audit({ action: 'key.new', keyId: record.id, fingerprint: record.fingerprint });
    return { key, id: record.id, fingerprint: record.fingerprint, createdAt: record.createdAt };
  }

  keyRotate() {
    const { key, record } = createOrReplaceKey(this.config.paths.keys, { rotate: true });
    this.audit({ action: 'key.rotate', keyId: record.id, fingerprint: record.fingerprint });
    return { key, id: record.id, fingerprint: record.fingerprint, createdAt: record.createdAt };
  }

  keyList() {
    return listKeyMeta(this.config.paths.keys);
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

  browsersList() {
    this.#requireHub();
    return this.hub.listBrowsers();
  }

  browsersBind(browserId) {
    this.#requireHub();
    const status = this.hub.bind(browserId);
    this.audit({ action: 'browsers.bind', browserId, ok: true });
    return status;
  }

  browsersStatus() {
    this.#requireHub();
    return this.hub.status();
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
            allowDestructive: browser.allowDestructive
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

    const reqCheck = validateRpcRequest({ id: 'precheck', op, platform, args });
    if (!reqCheck.valid) {
      throw new ProtocolError(
        ERROR_CODES.BAD_REQUEST,
        reqCheck.errors.map((e) => e.path + ' ' + e.message).join('; ')
      );
    }

    assertPlatformEnabled(platform, this.config.settings, browser);

    const isDestructive = DESTRUCTIVE_OPS.includes(op);
    if (isDestructive) {
      try {
        assertDestructiveAllowed(op, this.config.settings, browser, { confirm: mcpOpts.confirm });
      } catch (err) {
        this.audit({
          action: op,
          platform,
          args: { chatId: args.chatId },
          ok: false,
          code: err.code,
          confirm: Boolean(mcpOpts.confirm)
        });
        throw err;
      }
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

export { loadConfig, saveConfig };
