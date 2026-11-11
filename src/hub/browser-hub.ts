import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  WS_TYPES,
  ProtocolError,
  validate,
  validateRpcResponse
} from '@chat-export/protocol';

export interface BrowserSession {
  browserId: string;
  browserLabel: string;
  extVersion?: string;
  platformsEnabled: string[];
  allowCreate: boolean;
  allowDestructive: boolean;
  allowProjects: boolean;
  tabs: any[];
  connectedAt: string;
  ws: WebSocket;
}

export type PublicBrowser = Omit<BrowserSession, 'ws'> & { bound: boolean };

export interface HelloAuth {
  browserId: string;
  browserLabel?: string;
  fingerprint?: string;
  hostIp?: string;
  permissions?: { allowCreate?: boolean; allowDestructive?: boolean; allowProjects?: boolean };
  tabs?: any[];
}

export interface BrowserHubOptions {
  serverVersion: string;
  rpcTimeoutMs?: number;
  authorizeHello: (hello: any, meta?: { remoteAddress?: string }) => HelloAuth | null;
  onPresence?: (session: BrowserSession, meta?: { remoteAddress?: string; hostIp?: string }) => void;
  onDisconnect?: (browserId: string) => void;
  onAudit?: (event: Record<string, unknown>) => void;
}

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
  browserId: string;
}

const laneBrowserStorage = new AsyncLocalStorage<string>();

// WebSocket registry for extension browsers on the same HTTP server.
export class BrowserHub {
  serverVersion: string;
  rpcTimeoutMs: number;
  authorizeHello: BrowserHubOptions['authorizeHello'];
  onPresence: NonNullable<BrowserHubOptions['onPresence']>;
  onDisconnect: NonNullable<BrowserHubOptions['onDisconnect']>;
  onAudit: NonNullable<BrowserHubOptions['onAudit']>;
  browsers = new Map<string, BrowserSession>();
  boundBrowserId: string | null = null;
  pending = new Map<string, PendingRpc>();
  wss: WebSocketServer | null = null;
  _onUpgrade: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null;
  _httpServer: HttpServer | null = null;
  private _connectListeners = new Set<(browserId: string) => void>();

  constructor(opts: BrowserHubOptions) {
    this.serverVersion = opts.serverVersion;
    this.rpcTimeoutMs = opts.rpcTimeoutMs ?? 60_000;
    this.authorizeHello = opts.authorizeHello;
    this.onPresence = opts.onPresence || (() => {});
    this.onDisconnect = opts.onDisconnect || (() => {});
    this.onAudit = opts.onAudit || (() => {});
  }

  attach(
    httpServer: HttpServer,
    opts: { path?: string; aliasPaths?: string[]; verifyUpgrade?: (req: IncomingMessage) => boolean } = {}
  ): this {
    const path = opts.path || '/ws';
    const aliases = opts.aliasPaths || ['/ext'];
    const paths = new Set([path, ...aliases.filter(Boolean)]);
    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;
    wss.on('connection', (ws, req) => this.#onConnection(ws, req));
    this._onUpgrade = (req, socket, head) => {
      let pathname = '/';
      try {
        pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      } catch {
        socket.destroy();
        return;
      }
      if (!paths.has(pathname)) return;
      if (opts.verifyUpgrade && !opts.verifyUpgrade(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    };
    httpServer.on('upgrade', this._onUpgrade);
    this._httpServer = httpServer;
    return this;
  }

  close(): void {
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

  listBrowsers(): PublicBrowser[] {
    return [...this.browsers.values()].map((b) => this.#publicBrowser(b));
  }

  bind(browserId: string) {
    if (!browserId || !this.browsers.has(browserId)) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'browser not connected: ' + browserId);
    }
    this.boundBrowserId = browserId;
    return this.status();
  }

  unbind(): void {
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

  getBound(): BrowserSession | null {
    const laneId = laneBrowserStorage.getStore();
    const effectiveId = laneId || this.boundBrowserId;
    if (!effectiveId) return null;
    return this.browsers.get(effectiveId) || null;
  }

  isOnline(browserId: string): boolean {
    const session = this.browsers.get(browserId);
    return Boolean(session && session.ws.readyState === 1);
  }

  onBrowserConnected(cb: (browserId: string) => void): () => void {
    this._connectListeners.add(cb);
    return () => {
      this._connectListeners.delete(cb);
    };
  }

  async runInLane<T>(browserId: string, fn: () => Promise<T>): Promise<T> {
    if (!this.isOnline(browserId)) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'browser not connected: ' + browserId);
    }
    return laneBrowserStorage.run(browserId, fn);
  }

  #emitBrowserConnected(browserId: string): void {
    for (const cb of this._connectListeners) {
      try {
        cb(browserId);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  // Forward RPC to the bound browser.
  async rpc(req: { op: string; platform: string; args?: object; id?: string }): Promise<any> {
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

    return new Promise<any>((resolve, reject) => {
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
      } catch (err: any) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new ProtocolError(ERROR_CODES.HOST_ERROR, err.message || String(err)));
      }
    });
  }

  #publicBrowser(b: BrowserSession): PublicBrowser {
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

  #onConnection(ws: WebSocket, req: IncomingMessage): void {
    let browserId: string | null = null;
    let helloDone = false;

    ws.on('message', (data) => {
      let msg: any;
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

        const sessionId: string = auth.browserId || msg.browserId;
        browserId = sessionId;
        const existing = this.browsers.get(sessionId);
        if (existing && existing.ws !== ws) {
          try {
            existing.ws.close();
          } catch {
            /* ignore */
          }
        }

        const session: BrowserSession = {
          browserId: sessionId,
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
        this.browsers.set(sessionId, session);
        this.onPresence(session, { remoteAddress: auth.hostIp || req?.socket?.remoteAddress || '' });
        helloDone = true;

        if (!this.boundBrowserId) {
          this.boundBrowserId = sessionId;
        }

        const welcome = {
          type: WS_TYPES.WELCOME,
          v: PROTOCOL_VERSION,
          browserId: sessionId,
          serverVersion: this.serverVersion,
          bound: this.boundBrowserId === sessionId
        };
        ws.send(JSON.stringify(welcome));
        this.onAudit({
          action: 'ws.hello',
          ok: true,
          browserId: sessionId,
          browserLabel: session.browserLabel
        });
        this.#emitBrowserConnected(sessionId);
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

  #handleSettings(browserId: string | null, msg: any, ws: WebSocket): void {
    const check = validate('WsSettings', msg);
    if (!check.valid) {
      this.#sendError(ws, ERROR_CODES.BAD_REQUEST, check.errors[0]?.message || 'invalid settings', msg.id);
      return;
    }
    const session = browserId ? this.browsers.get(browserId) : undefined;
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

  #handleTabs(browserId: string | null, msg: any, ws: WebSocket): void {
    const check = validate('WsTabs', msg);
    if (!check.valid) {
      this.#sendError(ws, ERROR_CODES.BAD_REQUEST, check.errors[0]?.message || 'invalid tabs', msg.id);
      return;
    }
    const session = browserId ? this.browsers.get(browserId) : undefined;
    if (!session) return;
    session.tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
    this.onPresence(session);
    this.onAudit({ action: 'ws.tabs', browserId, tabs: session.tabs.length, ok: true });
  }

  #handleRpcResult(msg: any): void {
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

  #sendError(ws: WebSocket, code: string, message: string, id?: string): void {
    const frame: Record<string, unknown> = { type: WS_TYPES.ERROR, code, message };
    if (id) frame.id = id;
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* ignore */
    }
  }
}
