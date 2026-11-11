import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  WS_TYPES,
  ProtocolError,
  validate,
  validateRpcResponse
} from '@chat-export/protocol';

/**
 * WebSocket registry for extension browsers on the same HTTP server.
 */
export class BrowserHub {
  /**
   * @param {{
   *   serverVersion: string,
   *   rpcTimeoutMs?: number,
   *   authorizeHello: (hello: object, meta?: { remoteAddress?: string }) => object | null,
   *   onPresence?: (session: object, meta?: { remoteAddress?: string }) => void,
   *   onDisconnect?: (browserId: string) => void,
   *   onAudit?: (event: object) => void
   * }} opts
   */
  constructor(opts) {
    this.serverVersion = opts.serverVersion;
    this.rpcTimeoutMs = opts.rpcTimeoutMs ?? 60_000;
    this.authorizeHello = opts.authorizeHello;
    this.onPresence = opts.onPresence || (() => {});
    this.onDisconnect = opts.onDisconnect || (() => {});
    this.onAudit = opts.onAudit || (() => {});
    /** @type {Map<string, object>} */
    this.browsers = new Map();
    /** @type {string | null} */
    this.boundBrowserId = null;
    /** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout, browserId: string }>} */
    this.pending = new Map();
    this.wss = null;
  }

  /**
   * @param {import('node:http').Server} httpServer
   * @param {{ path?: string, aliasPaths?: string[] }} [opts]
   */
  attach(httpServer, opts = {}) {
    const path = opts.path || '/ws';
    const aliases = opts.aliasPaths || ['/ext'];
    const paths = new Set([path, ...aliases.filter(Boolean)]);
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => this.#onConnection(ws, req));
    this._onUpgrade = (req, socket, head) => {
      let pathname = '/';
      try {
        pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      } catch {
        socket.destroy();
        return;
      }
      if (!paths.has(pathname)) return;
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    };
    httpServer.on('upgrade', this._onUpgrade);
    this._httpServer = httpServer;
    return this;
  }

  close() {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new ProtocolError(ERROR_CODES.TIMEOUT, 'hub closing'));
      this.pending.delete(id);
    }
    for (const session of this.browsers.values()) {
      try {
        session.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.browsers.clear();
    this.boundBrowserId = null;
    if (this._httpServer && this._onUpgrade) {
      this._httpServer.off('upgrade', this._onUpgrade);
      this._httpServer = null;
      this._onUpgrade = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  listBrowsers() {
    return [...this.browsers.values()].map((b) => this.#publicBrowser(b));
  }

  bind(browserId) {
    if (!browserId || !this.browsers.has(browserId)) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'browser not connected: ' + browserId);
    }
    this.boundBrowserId = browserId;
    return this.status();
  }

  unbind() {
    this.boundBrowserId = null;
  }

  status() {
    const bound = this.boundBrowserId ? this.browsers.get(this.boundBrowserId) : null;
    return {
      boundBrowserId: this.boundBrowserId,
      online: Boolean(bound),
      browser: bound ? this.#publicBrowser(bound) : null,
      browsers: this.listBrowsers()
    };
  }

  getBound() {
    if (!this.boundBrowserId) return null;
    return this.browsers.get(this.boundBrowserId) || null;
  }

  /**
   * Forward RPC to the bound browser.
   * @param {{ op: string, platform: string, args: object, id?: string }} req
   */
  async rpc(req) {
    const browser = this.getBound();
    if (!browser) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'no browser bound');
    }
    const id = req.id || randomUUID();
    const frame = {
      type: WS_TYPES.RPC,
      id,
      op: req.op,
      platform: req.platform,
      args: req.args || {}
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProtocolError(ERROR_CODES.TIMEOUT, 'rpc timeout after ' + this.rpcTimeoutMs + 'ms'));
      }, this.rpcTimeoutMs);

      this.pending.set(id, { resolve, reject, timer, browserId: browser.browserId });

      try {
        if (browser.ws.readyState !== 1) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new ProtocolError(ERROR_CODES.NOT_BOUND, 'bound browser socket closed'));
          return;
        }
        browser.ws.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new ProtocolError(ERROR_CODES.HOST_ERROR, err.message || String(err)));
      }
    });
  }

  #publicBrowser(b) {
    return {
      browserId: b.browserId,
      browserLabel: b.browserLabel,
      extVersion: b.extVersion,
      platformsEnabled: [...b.platformsEnabled],
      allowCreate: Boolean(b.allowCreate),
      allowDestructive: Boolean(b.allowDestructive),
      allowProjects: Boolean(b.allowProjects),
      tabs: Array.isArray(b.tabs) ? b.tabs : [],
      connectedAt: b.connectedAt,
      bound: this.boundBrowserId === b.browserId
    };
  }

  #onConnection(ws, req) {
    /** @type {string | null} */
    let browserId = null;
    let helloDone = false;

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        this.#sendError(ws, ERROR_CODES.BAD_REQUEST, 'invalid json');
        return;
      }

      if (!helloDone) {
        if (msg?.type !== WS_TYPES.HELLO) {
          this.#sendError(ws, ERROR_CODES.BAD_REQUEST, 'hello required first');
          ws.close();
          return;
        }
        const check = validate('WsHello', msg);
        if (!check.valid) {
          this.#sendError(ws, ERROR_CODES.BAD_REQUEST, check.errors[0]?.message || 'invalid hello');
          ws.close();
          return;
        }
        const auth = this.authorizeHello(msg, { remoteAddress: req?.socket?.remoteAddress || '' });
        if (!auth) {
          this.#sendError(ws, ERROR_CODES.UNAUTHORIZED, 'invalid key');
          this.onAudit({ action: 'ws.hello', ok: false, code: ERROR_CODES.UNAUTHORIZED });
          ws.close();
          return;
        }

        browserId = auth.browserId || msg.browserId;
        const existing = this.browsers.get(browserId);
        if (existing && existing.ws !== ws) {
          try {
            existing.ws.close();
          } catch {
            /* ignore */
          }
        }

        const session = {
          browserId,
          browserLabel: auth.browserLabel || msg.browserLabel,
          extVersion: msg.extVersion,
          platformsEnabled: [...msg.platformsEnabled],
          allowCreate: msg.allowCreate !== undefined ? Boolean(msg.allowCreate) : auth.permissions?.allowCreate !== false,
          allowDestructive: Boolean(msg.allowDestructive),
          allowProjects: msg.allowProjects !== undefined ? Boolean(msg.allowProjects) : auth.permissions?.allowProjects !== false,
          tabs: Array.isArray(msg.tabs) ? msg.tabs : auth.tabs || [],
          connectedAt: new Date().toISOString(),
          ws
        };
        this.browsers.set(browserId, session);
        this.onPresence(session, { remoteAddress: auth.hostIp || req?.socket?.remoteAddress || '' });
        helloDone = true;

        if (!this.boundBrowserId) {
          this.boundBrowserId = browserId;
        }

        const welcome = {
          type: WS_TYPES.WELCOME,
          v: PROTOCOL_VERSION,
          browserId,
          serverVersion: this.serverVersion,
          bound: this.boundBrowserId === browserId
        };
        ws.send(JSON.stringify(welcome));
        this.onAudit({
          action: 'ws.hello',
          ok: true,
          browserId,
          browserLabel: session.browserLabel
        });
        return;
      }

      if (msg?.type === WS_TYPES.SETTINGS) {
        this.#handleSettings(browserId, msg, ws);
        return;
      }

      if (msg?.type === WS_TYPES.TABS) {
        this.#handleTabs(browserId, msg, ws);
        return;
      }

      if (msg?.type === WS_TYPES.RPC_RESULT || (msg && msg.id && typeof msg.ok === 'boolean')) {
        this.#handleRpcResult(msg);
        return;
      }

      this.#sendError(ws, ERROR_CODES.BAD_REQUEST, 'unknown frame type', msg?.id);
    });

    ws.on('close', () => {
      if (!browserId) return;
      const current = this.browsers.get(browserId);
      if (current && current.ws === ws) {
        this.browsers.delete(browserId);
        for (const [id, p] of this.pending) {
          if (p.browserId === browserId) {
            clearTimeout(p.timer);
            p.reject(new ProtocolError(ERROR_CODES.NOT_BOUND, 'browser disconnected'));
            this.pending.delete(id);
          }
        }
        if (this.boundBrowserId === browserId) {
          this.boundBrowserId = null;
          const next = this.browsers.keys().next();
          if (!next.done) this.boundBrowserId = next.value;
        }
        this.onDisconnect(browserId);
        this.onAudit({ action: 'ws.close', browserId });
      }
    });
  }

  #handleSettings(browserId, msg, ws) {
    const check = validate('WsSettings', msg);
    if (!check.valid) {
      this.#sendError(ws, ERROR_CODES.BAD_REQUEST, check.errors[0]?.message || 'invalid settings', msg.id);
      return;
    }
    const session = this.browsers.get(browserId);
    if (!session) return;
    session.platformsEnabled = [...msg.platformsEnabled];
    if (msg.allowCreate !== undefined) session.allowCreate = Boolean(msg.allowCreate);
    if (msg.allowDestructive !== undefined) session.allowDestructive = Boolean(msg.allowDestructive);
    if (msg.allowProjects !== undefined) session.allowProjects = Boolean(msg.allowProjects);
    if (typeof msg.browserLabel === 'string') session.browserLabel = msg.browserLabel;
    this.onPresence(session);
    this.onAudit({
      action: 'ws.settings',
      browserId,
      platformsEnabled: session.platformsEnabled,
      allowCreate: session.allowCreate,
      allowDestructive: session.allowDestructive
    });
  }

  #handleTabs(browserId, msg, ws) {
    const check = validate('WsTabs', msg);
    if (!check.valid) {
      this.#sendError(ws, ERROR_CODES.BAD_REQUEST, check.errors[0]?.message || 'invalid tabs', msg.id);
      return;
    }
    const session = this.browsers.get(browserId);
    if (!session) return;
    session.tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
    this.onPresence(session);
    this.onAudit({ action: 'ws.tabs', browserId, tabs: session.tabs.length, ok: true });
  }

  #handleRpcResult(msg) {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    const check = validateRpcResponse(msg);
    if (!check.valid) {
      pending.reject(
        new ProtocolError(ERROR_CODES.BAD_REQUEST, check.errors[0]?.message || 'invalid rpc.result')
      );
      return;
    }

    if (msg.ok) {
      pending.resolve(msg.data);
    } else {
      pending.reject(
        new ProtocolError(msg.error.code, msg.error.message, msg.error.details)
      );
    }
  }

  #sendError(ws, code, message, id) {
    const frame = { type: WS_TYPES.ERROR, code, message };
    if (id) frame.id = id;
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* ignore */
    }
  }
}
