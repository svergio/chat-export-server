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
   *   verifyKey: (key: string) => boolean,
   *   onAudit?: (event: object) => void
   * }} opts
   */
  constructor(opts) {
    this.serverVersion = opts.serverVersion;
    this.rpcTimeoutMs = opts.rpcTimeoutMs ?? 60_000;
    this.verifyKey = opts.verifyKey;
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
   * @param {{ path?: string }} [opts]
   */
  attach(httpServer, opts = {}) {
    const path = opts.path || '/ws';
    this.wss = new WebSocketServer({ server: httpServer, path });
    this.wss.on('connection', (ws) => this.#onConnection(ws));
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
      allowDestructive: Boolean(b.allowDestructive),
      connectedAt: b.connectedAt,
      bound: this.boundBrowserId === b.browserId
    };
  }

  #onConnection(ws) {
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
        if (!this.verifyKey(msg.key)) {
          this.#sendError(ws, ERROR_CODES.UNAUTHORIZED, 'invalid key');
          this.onAudit({ action: 'ws.hello', ok: false, code: ERROR_CODES.UNAUTHORIZED });
          ws.close();
          return;
        }

        browserId = msg.browserId;
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
          browserLabel: msg.browserLabel,
          extVersion: msg.extVersion,
          platformsEnabled: [...msg.platformsEnabled],
          allowDestructive: Boolean(msg.allowDestructive),
          connectedAt: new Date().toISOString(),
          ws
        };
        this.browsers.set(browserId, session);
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
    if (msg.allowDestructive !== undefined) session.allowDestructive = Boolean(msg.allowDestructive);
    if (typeof msg.browserLabel === 'string') session.browserLabel = msg.browserLabel;
    this.onAudit({
      action: 'ws.settings',
      browserId,
      platformsEnabled: session.platformsEnabled,
      allowDestructive: session.allowDestructive
    });
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
