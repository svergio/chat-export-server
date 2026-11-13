import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { DatabaseAdapter, Row, SqlParam } from '../../types.js';

export type JobStatus = 'queued' | 'assigned' | 'running' | 'waiting_host' | 'done' | 'error' | 'cancelled';

export interface JobProgress {
  done: number;
  total: number;
  current: unknown;
  [key: string]: unknown;
}

export interface JobRecord {
  id: string;
  kind: string;
  browserId: string;
  platform: string;
  status: JobStatus;
  input: Record<string, any>;
  progress: JobProgress;
  state: Record<string, any>;
  result: any;
  error: any;
  attempts: number;
  cancelRequested: boolean;
  retryAt: string | null;
  chatId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobPatch {
  status?: JobStatus;
  attempts?: number;
  cancelRequested?: boolean;
  retryAt?: number | string | null;
  result?: any;
  error?: any;
  progress?: Partial<JobProgress>;
  state?: Record<string, any> | null;
}

export interface JobFilter {
  status?: string;
  kind?: string;
  browserId?: string;
  limit?: number;
}

export const JOB_KINDS = Object.freeze([
  'ask',
  'export',
  'export_batch',
  'library_ingest',
  'delete',
  'delete_batch'
]);
export const JOB_STATUSES: readonly JobStatus[] = Object.freeze<JobStatus[]>([
  'queued',
  'assigned',
  'running',
  'waiting_host',
  'done',
  'error',
  'cancelled'
]);
export const TERMINAL_STATUSES: readonly JobStatus[] = Object.freeze<JobStatus[]>(['done', 'error', 'cancelled']);
export const ACTIVE_STATUSES: readonly JobStatus[] = Object.freeze<JobStatus[]>(['assigned', 'running', 'waiting_host']);
export const DEFAULT_JOB_TTL_MS = 24 * 60 * 60 * 1000;

const JOB_ID_RE = /^job_[A-Za-z0-9-]+$/;
const NON_TERMINAL_STATUSES = JOB_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s));
const DEFAULT_PROGRESS: Readonly<JobProgress> = Object.freeze({ done: 0, total: 0, current: null });

export function isTerminal(status: unknown): boolean {
  return (TERMINAL_STATUSES as readonly unknown[]).includes(status);
}

function placeholders(list: readonly unknown[]): string {
  return list.map(() => '?').join(',');
}

function parseJson(text: unknown, fallback: any): any {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(String(text));
  } catch {
    return fallback;
  }
}

function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function toEpoch(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * progress_json carries both the public progress counters and the runner's resumable `state`
 * (the plan schema has no dedicated state column): { done, total, current, state: {...} }.
 */
function rowToJob(row: Row | null): JobRecord | null {
  if (!row) return null;
  const { state, ...progress } = parseJson(row.progress_json, {});
  return {
    id: row.id,
    kind: row.kind,
    browserId: row.lane_browser_id,
    platform: row.platform,
    status: row.status,
    input: parseJson(row.input_json, {}),
    progress: { ...DEFAULT_PROGRESS, ...progress },
    state: state || {},
    result: parseJson(row.result_json, null),
    error: parseJson(row.error_json, null),
    attempts: row.attempts || 0,
    cancelRequested: Boolean(row.cancel_requested),
    retryAt: row.retry_at ? new Date(Number(row.retry_at)).toISOString() : null,
    chatId: row.chat_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Job queue on the `jobs` table of the shared DB bus.
 * Lifecycle: queued -> assigned -> running -> waiting_host -> done | error | cancelled.
 * `db` is any adapter from core/db (sqlite WAL by default, or an external driver).
 */
export class JobStore extends EventEmitter {
  db: DatabaseAdapter;
  now: () => number;
  closed: boolean;
  orderBy: string;

  constructor(db: DatabaseAdapter, opts: { now?: () => number } = {}) {
    super();
    if (!db || typeof db.run !== 'function') throw new TypeError('JobStore requires a db adapter');
    this.db = db;
    this.now = opts.now || Date.now;
    this.closed = false;
    this.orderBy = 'created_at, ' + (db.rowOrder === 'rowid' ? 'rowid' : 'id');
  }

  #ts(): string {
    return new Date(this.now()).toISOString();
  }

  create(spec: { kind: string; browserId: string; platform: string; input?: Record<string, any> }): JobRecord {
    const ts = this.#ts();
    const input = spec.input || {};
    const id = 'job_' + randomUUID();
    this.db.run(
      `INSERT INTO jobs (id, lane_browser_id, kind, platform, status, input_json, progress_json, attempts,
        cancel_requested, chat_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, 0, ?, ?, ?)`,
      [
        id,
        spec.browserId,
        spec.kind,
        spec.platform,
        JSON.stringify(input),
        JSON.stringify({ ...DEFAULT_PROGRESS, state: {} }),
        input.chatId ? String(input.chatId) : null,
        ts,
        ts
      ]
    );
    const job = this.get(id);
    this.emit('update', job);
    return job as JobRecord;
  }

  get(id: string | null | undefined): JobRecord | null {
    if (this.closed || !id || !JOB_ID_RE.test(id)) return null;
    return rowToJob(this.db.get('SELECT * FROM jobs WHERE id = ?', [id]));
  }

  // Patch uses the public job shape (status, progress, state, result, error, attempts, cancelRequested, retryAt).
  update(id: string, patch: JobPatch): JobRecord | null {
    if (this.closed) return null;
    const job = this.get(id);
    if (!job) return null;
    const sets: string[] = [];
    const params: SqlParam[] = [];
    const set = (column: string, value: SqlParam) => {
      sets.push(column + ' = ?');
      params.push(value);
    };
    if ('status' in patch) set('status', patch.status);
    if ('attempts' in patch) set('attempts', patch.attempts);
    if ('cancelRequested' in patch) set('cancel_requested', patch.cancelRequested ? 1 : 0);
    if ('retryAt' in patch) set('retry_at', toEpoch(patch.retryAt));
    if ('result' in patch) set('result_json', toJson(patch.result));
    if ('error' in patch) set('error_json', toJson(patch.error));
    if ('progress' in patch || 'state' in patch) {
      const progress = 'progress' in patch ? patch.progress : job.progress;
      const state = 'state' in patch ? patch.state : job.state;
      set('progress_json', JSON.stringify({ ...progress, state: state || {} }));
    }
    const chatId = patch.result?.chatId || patch.state?.chatId;
    if (chatId) set('chat_id', String(chatId));
    set('updated_at', this.#ts());
    params.push(id);
    this.db.run('UPDATE jobs SET ' + sets.join(', ') + ' WHERE id = ?', params);
    const next = this.get(id);
    this.emit('update', next);
    return next;
  }

  /** Atomic queued -> assigned handoff; returns null when another path already moved the job. */
  claim(id: string): JobRecord | null {
    if (this.closed) return null;
    const { changes } = this.db.run(
      "UPDATE jobs SET status = 'assigned', updated_at = ? WHERE id = ? AND status = 'queued'",
      [this.#ts(), id]
    );
    if (!changes) return null;
    const job = this.get(id);
    this.emit('update', job);
    return job;
  }

  list(filter: JobFilter = {}): JobRecord[] {
    if (this.closed) return [];
    const limit = Math.max(1, Math.min(500, Number(filter.limit) || 50));
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.kind) {
      where.push('kind = ?');
      params.push(filter.kind);
    }
    if (filter.browserId) {
      where.push('lane_browser_id = ?');
      params.push(filter.browserId);
    }
    const sql =
      'SELECT * FROM jobs' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY created_at DESC, ' +
      (this.db.rowOrder === 'rowid' ? 'rowid' : 'id') +
      ' DESC LIMIT ?';
    return this.db.all(sql, [...params, limit]).map((row) => rowToJob(row) as JobRecord);
  }

  /** Job ids of a lane in FIFO order (all statuses). */
  laneOrder(browserId: string): string[] {
    if (this.closed) return [];
    return this.db
      .all('SELECT id FROM jobs WHERE lane_browser_id = ? ORDER BY ' + this.orderBy, [browserId])
      .map((r) => r.id);
  }

  /** Non-terminal jobs of a lane in FIFO order. */
  laneQueue(browserId: string): JobRecord[] {
    if (this.closed) return [];
    return this.db
      .all(
        `SELECT * FROM jobs WHERE lane_browser_id = ? AND status IN (${placeholders(NON_TERMINAL_STATUSES)})
         ORDER BY ${this.orderBy}`,
        [browserId, ...NON_TERMINAL_STATUSES]
      )
      .map((row) => rowToJob(row) as JobRecord);
  }

  /** Lanes that still have unfinished work. */
  lanes(): string[] {
    if (this.closed) return [];
    return this.db
      .all(
        `SELECT DISTINCT lane_browser_id FROM jobs WHERE status IN (${placeholders(NON_TERMINAL_STATUSES)})`,
        [...NON_TERMINAL_STATUSES]
      )
      .map((r) => r.lane_browser_id);
  }

  /** Restart recovery: anything mid-flight (assigned/running/waiting_host) goes back to queued. */
  recover(): string[] {
    if (this.closed) return [];
    return this.db.transaction((db) => {
      const ids = db
        .all(`SELECT id FROM jobs WHERE status IN (${placeholders(ACTIVE_STATUSES)})`, [...ACTIVE_STATUSES])
        .map((r) => r.id);
      if (ids.length) {
        db.run(`UPDATE jobs SET status = 'queued', updated_at = ? WHERE status IN (${placeholders(ACTIVE_STATUSES)})`, [
          this.#ts(),
          ...ACTIVE_STATUSES
        ]);
      }
      return ids;
    });
  }

  prune(ttlMs = DEFAULT_JOB_TTL_MS): string[] {
    if (this.closed) return [];
    const cutoff = new Date(this.now() - ttlMs).toISOString();
    return this.db.transaction((db) => {
      const ids = db
        .all(`SELECT id FROM jobs WHERE status IN (${placeholders(TERMINAL_STATUSES)}) AND updated_at <= ?`, [
          ...TERMINAL_STATUSES,
          cutoff
        ])
        .map((r) => r.id);
      if (ids.length) {
        db.run(`DELETE FROM jobs WHERE status IN (${placeholders(TERMINAL_STATUSES)}) AND updated_at <= ?`, [
          ...TERMINAL_STATUSES,
          cutoff
        ]);
      }
      return ids;
    });
  }

  /** Detaches listeners and stops further writes; the shared db is owned (and closed) by ServerCore. */
  close(): void {
    this.closed = true;
    this.removeAllListeners();
  }
}
