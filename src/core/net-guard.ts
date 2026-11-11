import type { IncomingMessage } from 'node:http';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function extraAllowedHostnames(): Set<string> {
  const raw = process.env.CHAT_EXPORT_ALLOWED_HOSTS;
  if (!raw || !String(raw).trim()) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}
const EXTENSION_ORIGIN_RE = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/i;

export function hostnameOfHostHeader(value: string | undefined): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end > 0 ? raw.slice(0, end + 1) : raw;
  }
  const colon = raw.lastIndexOf(':');
  return colon > 0 ? raw.slice(0, colon) : raw;
}

export function isAllowedHostHeader(req: IncomingMessage, boundHost: string): boolean {
  const name = hostnameOfHostHeader(req.headers.host);
  if (!name) return false;
  if (LOOPBACK_HOSTNAMES.has(name)) return true;
  if (extraAllowedHostnames().has(name)) return true;
  return name === String(boundHost || '').toLowerCase();
}

// Browsers always attach Origin to cross-site POST and WebSocket requests.
// Native clients (MCP, curl) send none; the extension sends chrome-extension://<id>.
export function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== 'string') return false;
  if (EXTENSION_ORIGIN_RE.test(origin)) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const ENROLL_CORS_ALLOW_HEADERS = 'content-type, accept';

export function corsHeadersForAllowedOrigin(req: IncomingMessage): Record<string, string> | null {
  const origin = req.headers.origin;
  if (origin === undefined || typeof origin !== 'string') return null;
  if (!isAllowedOrigin(req)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin'
  };
}

export function enrollCorsPreflightHeaders(req: IncomingMessage): Record<string, string> | null {
  const base = corsHeadersForAllowedOrigin(req);
  if (!base) return null;
  return {
    ...base,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': ENROLL_CORS_ALLOW_HEADERS,
    'Access-Control-Max-Age': '86400'
  };
}

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super('request body too large');
  }
}

export async function readLimitedBody(req: IncomingMessage, limit = MAX_JSON_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new BodyTooLargeError();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; first: number; lockedUntil: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 60_000,
    private readonly lockMs = 2 * 60_000
  ) {}

  retryAfterMs(key: string, now = Date.now()): number {
    const row = this.failures.get(key);
    if (!row) return 0;
    if (row.lockedUntil > now) return row.lockedUntil - now;
    if (now - row.first > this.windowMs) this.failures.delete(key);
    return 0;
  }

  fail(key: string, now = Date.now()): void {
    const row = this.failures.get(key);
    if (!row || now - row.first > this.windowMs) {
      this.failures.set(key, { count: 1, first: now, lockedUntil: 0 });
      return;
    }
    row.count += 1;
    if (row.count >= this.maxFailures) row.lockedUntil = now + this.lockMs;
  }

  success(key: string): void {
    this.failures.delete(key);
  }
}
