import fs from 'node:fs';
import path from 'node:path';
import { ERROR_CODES } from '@chat-export/protocol';
import type { DatabaseAdapter, LogEvent, LoadedConfig } from '../types.js';

const LEVEL_RANK: Readonly<Record<string, number>> = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3, alert: 3 });

const SECRET_PATTERNS = [
  /\bcem_[a-f0-9]+\b/gi,
  /\bceb_[a-f0-9]+\b/gi,
  /\bcek_[a-f0-9]+\b/gi,
  /Bearer\s+\S+/gi
];

export const ALERT_CODES = new Set<string>([
  ERROR_CODES.UNAUTHORIZED,
  ERROR_CODES.TIMEOUT,
  ERROR_CODES.HOST_ERROR,
  ERROR_CODES.DESTRUCTIVE_DISABLED,
  ERROR_CODES.CREATE_DISABLED,
  ERROR_CODES.PROJECTS_DISABLED,
  'PLATFORM_BUSY',
  'RATE_LIMIT',
  'CAPTCHA',
  'WS_DISCONNECT'
]);

export function redactSecrets<T = unknown>(value: T): T {
  if (typeof value === 'string') {
    let out: string = value;
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern, '[REDACTED]');
    }
    return out as T;
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = redactSecrets(child);
    }
    return out as T;
  }
  return value;
}

function dirOf(filePath: string): string {
  return path.dirname(filePath);
}

function shouldLog(configuredLevel: string, level: string): boolean {
  const want = LEVEL_RANK[configuredLevel] ?? LEVEL_RANK.info;
  const have = LEVEL_RANK[level] ?? LEVEL_RANK.info;
  return have >= want;
}

function formatLine(entry: unknown): string {
  return JSON.stringify(redactSecrets(entry)) + '\n';
}

export type LoggerDbSource = (() => DatabaseAdapter | null) | DatabaseAdapter | null;

export interface FileLoggerOptions {
  filePath: string;
  alertsFilePath: string;
  level?: string;
  maxBytes?: number;
  db?: LoggerDbSource;
}

interface AlertSummary {
  ts: string;
  code: string | null;
  message: string;
  component: string | null;
  tool: string | null;
  platform: string | null;
  browser_id: string | null;
}

interface LogOptions {
  alerts: boolean;
  metrics: boolean;
  component?: string;
}

type LogEntry = Record<string, any>;

export class FileLogger {
  filePath: string;
  alertsFilePath: string;
  level: string;
  maxBytes: number;
  _db: LoggerDbSource;
  _recentAlerts: AlertSummary[];
  _maxRecentAlerts: number;

  constructor(opts: FileLoggerOptions) {
    this.filePath = opts.filePath;
    this.alertsFilePath = opts.alertsFilePath;
    this.level = opts.level || 'info';
    this.maxBytes = opts.maxBytes ?? 10_485_760;
    this._db = opts.db || null;
    this._recentAlerts = [];
    this._maxRecentAlerts = 30;
  }

  resolveDb(): DatabaseAdapter | null {
    if (typeof this._db === 'function') return this._db();
    return this._db;
  }

  info(event: LogEvent): void {
    this.#log('info', event, { alerts: false, metrics: false });
  }

  warn(event: LogEvent): void {
    this.#log('warn', event, { alerts: false, metrics: false });
  }

  error(event: LogEvent): void {
    const code = event?.code || ERROR_CODES.HOST_ERROR;
    const alerts = ALERT_CODES.has(code);
    this.#log('error', event, { alerts, metrics: true });
  }

  alert(event: LogEvent): void {
    this.#log('alert', { ...event, code: event?.code || 'ALERT' }, { alerts: true, metrics: true });
  }

  metric(event: LogEvent): void {
    const level = event?.level || 'info';
    const ok = event?.ok !== false;
    this.#log(level, event, { alerts: false, metrics: true, component: event?.component || 'mcp' });
    if (!ok && event?.code && ALERT_CODES.has(event.code)) {
      this.#appendAlert(event);
    }
  }

  tail(lines = 50, onlyAlerts = false): LogEntry[] {
    const target = onlyAlerts ? this.alertsFilePath : this.filePath;
    if (!fs.existsSync(target)) return [];
    const text = fs.readFileSync(target, 'utf8');
    const rows = text.split('\n').filter(Boolean);
    return rows.slice(-lines).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  }

  recentAlerts(limit = 10): AlertSummary[] {
    return this._recentAlerts.slice(-limit);
  }

  #log(level: string, event: LogEvent, opts: LogOptions): void {
    if (!shouldLog(this.level, level)) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      component: event?.component || opts.component || 'server',
      message: event?.message || '',
      ...event
    };
    this.#appendFile(this.filePath, entry);
    if (opts.alerts) this.#appendAlert(entry);
    if (opts.metrics) this.#writeMetrics(entry, event);
  }

  #appendFile(filePath: string, entry: LogEntry): void {
    fs.mkdirSync(dirOf(filePath), { recursive: true, mode: 0o700 });
    this.#maybeRotate(filePath);
    fs.appendFileSync(filePath, formatLine(entry), { mode: 0o600 });
  }

  #appendAlert(entry: LogEntry): void {
    const alertEntry: LogEntry = { ...entry, level: entry.level === 'alert' ? 'alert' : 'error' };
    this.#appendFile(this.alertsFilePath, alertEntry);
    this._recentAlerts.push({
      ts: alertEntry.ts,
      code: alertEntry.code || null,
      message: alertEntry.message || '',
      component: alertEntry.component || null,
      tool: alertEntry.tool || null,
      platform: alertEntry.platform || null,
      browser_id: alertEntry.browser_id || alertEntry.browserId || null
    });
    if (this._recentAlerts.length > this._maxRecentAlerts) {
      this._recentAlerts.splice(0, this._recentAlerts.length - this._maxRecentAlerts);
    }
  }

  #maybeRotate(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const size = fs.statSync(filePath).size;
      if (size <= this.maxBytes) return;
      const rotated = filePath + '.1';
      if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
      fs.renameSync(filePath, rotated);
    } catch {
      /* ignore rotation errors */
    }
  }

  #writeMetrics(entry: LogEntry, event: LogEvent): void {
    const db = this.resolveDb();
    if (!db) return;
    const detail = event?.detail ?? event?.detail_json ?? event?.details ?? null;
    try {
      db.run(
        `INSERT INTO metrics_log (
           ts, level, component, tool, browser_id, platform, duration_ms, ok, code, message, detail_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.ts,
          entry.level,
          entry.component || 'server',
          event?.tool || null,
          event?.browser_id || event?.browserId || null,
          event?.platform || null,
          event?.duration_ms ?? null,
          event?.ok === false ? 0 : 1,
          event?.code || null,
          event?.message || '',
          detail ? JSON.stringify(redactSecrets(detail)) : null
        ]
      );
    } catch {
      /* metrics must not break request path */
    }
  }
}

export function createLogger(
  config: Partial<Pick<LoadedConfig, 'logging' | 'paths'>>,
  dbGetter: LoggerDbSource = null
): FileLogger {
  const logging: Partial<LoadedConfig['logging']> = config.logging || {};
  const paths: Partial<LoadedConfig['paths']> = config.paths || {};
  return new FileLogger({
    filePath: (logging.filePath || paths.serverLog) as string,
    alertsFilePath: (logging.alertsFilePath || paths.alertsLog) as string,
    level: logging.level || 'info',
    maxBytes: logging.maxBytes ?? 10_485_760,
    db: dbGetter
  });
}
