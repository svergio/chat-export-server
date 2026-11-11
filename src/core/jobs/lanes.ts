import * as protocol from '@chat-export/protocol';
import { toProtocolError } from '../errors.js';
import type { JobPatch, JobRecord, JobStatus, JobStore } from './job-store.js';

const { ERROR_CODES, ProtocolError, RETRYABLE_ERROR_CODES } = protocol;

export const DEFAULT_BACKOFF_MS = Object.freeze([5_000, 15_000, 45_000]);
const MAX_ATTEMPTS = 20;
const RETRYABLE_CODES = new Set<string>([...RETRYABLE_ERROR_CODES, ERROR_CODES.TIMEOUT]);

export interface LaneContext {
  jobId: string;
  checkCancel(): void;
  setStatus(status: JobStatus): void;
  progress(progress: Record<string, unknown>): void;
  saveState(patch: Record<string, unknown>): void;
  sleep(ms: number): Promise<void>;
}

export interface LaneHub {
  onBrowserConnected(cb: (browserId: string) => void): () => void;
  isOnline(browserId: string): boolean;
  runInLane<T>(browserId: string, fn: () => Promise<T>): Promise<T>;
}

export interface LaneSchedulerOptions {
  store: JobStore;
  run: (job: JobRecord, ctx: LaneContext) => Promise<unknown>;
  backoffMs?: number[];
}

export class JobCancelled extends Error {
  constructor() {
    super('job cancelled');
    this.name = 'JobCancelled';
  }
}

export function isRetryable(err: any): boolean {
  return Boolean(err && (RETRYABLE_CODES.has(err.code) || err.details?.retryable === true));
}

function isLaneOffline(err: any): boolean {
  return err?.code === ERROR_CODES.NOT_BOUND;
}

/**
 * One async loop per browserId: serial inside a lane, parallel across lanes.
 */
export class LaneScheduler {
  store: JobStore;
  run: LaneSchedulerOptions['run'];
  backoffMs: number[];
  hub: LaneHub | null = null;
  closed = false;
  active = new Map<string, Promise<void>>();
  sleepers = new Set<{ timer?: NodeJS.Timeout; resolve: () => void }>();
  _off?: () => void;

  constructor(opts: LaneSchedulerOptions) {
    this.store = opts.store;
    this.run = opts.run;
    this.backoffMs = opts.backoffMs || [...DEFAULT_BACKOFF_MS];
  }

  attachHub(hub: LaneHub): void {
    this.hub = hub;
    this._off = hub.onBrowserConnected((browserId) => this.kick(browserId));
    for (const browserId of this.store.lanes()) this.kick(browserId);
  }

  kick(browserId: string): void {
    const hub = this.hub;
    if (this.closed || !hub || this.active.has(browserId)) return;
    if (!hub.isOnline(browserId)) return;
    const loop = this.#loop(browserId, hub).finally(() => {
      this.active.delete(browserId);
      if (!this.closed && this.store.laneQueue(browserId).some((j) => j.status === 'queued')) {
        if (hub.isOnline(browserId)) setImmediate(() => this.kick(browserId));
      }
    });
    this.active.set(browserId, loop);
  }

  isLaneBusy(browserId: string): boolean {
    return this.active.has(browserId);
  }

  async #loop(browserId: string, hub: LaneHub): Promise<void> {
    while (!this.closed) {
      const job = this.store.laneQueue(browserId).find((j) => j.status === 'queued');
      if (!job) return;
      if (!hub.isOnline(browserId)) return;
      const keepGoing = await this.#runOne(job, hub);
      if (!keepGoing) return;
    }
  }

  // Resolves false when the lane should stop (browser went offline).
  async #runOne(job: JobRecord, hub: LaneHub): Promise<boolean> {
    const { store } = this;
    let retries = 0;
    while (!this.closed) {
      const current = store.get(job.id);
      if (!current || current.status === 'cancelled') return true;
      if (current.cancelRequested) {
        store.update(job.id, { status: 'cancelled' });
        return true;
      }
      const attempts = (current.attempts || 0) + 1;
      if (attempts > MAX_ATTEMPTS) {
        store.update(job.id, {
          status: 'error',
          error: { code: ERROR_CODES.HOST_ERROR, message: 'too many attempts', retryable: false }
        });
        return true;
      }
      if (!store.claim(job.id)) return true;
      store.update(job.id, { status: 'running', attempts, error: null, retryAt: null });
      const ctx = this.#ctx(job.id);
      try {
        const result = await hub.runInLane(job.browserId, () => this.run(store.get(job.id) as JobRecord, ctx));
        if (this.closed) return false;
        store.update(job.id, { status: 'done', result: result ?? null });
        return true;
      } catch (err: unknown) {
        if (this.closed) return false;
        if (err instanceof JobCancelled) {
          store.update(job.id, { status: 'cancelled' });
          return true;
        }
        const pe = toProtocolError(err);
        if (isLaneOffline(pe)) {
          store.update(job.id, { status: 'queued', error: errorBody(pe, true) });
          return false;
        }
        if (isRetryable(pe) && retries < this.backoffMs.length) {
          const delay = this.backoffMs[retries++];
          store.update(job.id, {
            status: 'queued',
            error: errorBody(pe, true),
            retryAt: Date.now() + delay
          });
          await this.sleep(delay);
          continue;
        }
        store.update(job.id, { status: 'error', error: errorBody(pe, isRetryable(pe)) });
        return true;
      }
    }
    return false;
  }

  #ctx(jobId: string): LaneContext {
    const store = this.store;
    return {
      jobId,
      checkCancel: () => {
        if (this.closed || store.get(jobId)?.cancelRequested) throw new JobCancelled();
      },
      setStatus: (status: JobStatus) => {
        const job = store.get(jobId);
        if (job && job.status !== status) store.update(jobId, { status });
      },
      progress: (progress: Record<string, unknown>) => {
        const job = store.get(jobId);
        if (job) store.update(jobId, { progress: { ...job.progress, ...progress } } as JobPatch);
      },
      saveState: (patch: Record<string, unknown>) => {
        const job = store.get(jobId);
        if (job) store.update(jobId, { state: { ...job.state, ...patch } });
      },
      sleep: (ms: number) => this.sleep(ms)
    };
  }

  sleep(ms: number): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const entry: { timer?: NodeJS.Timeout; resolve: () => void } = { resolve };
      entry.timer = setTimeout(() => {
        this.sleepers.delete(entry);
        resolve();
      }, ms);
      this.sleepers.add(entry);
    });
  }

  close(): void {
    this.closed = true;
    if (this._off) this._off();
    for (const s of this.sleepers) {
      if (s.timer) clearTimeout(s.timer);
      s.resolve();
    }
    this.sleepers.clear();
  }
}

function errorBody(pe: any, retryable: boolean) {
  const body: Record<string, unknown> = { code: pe.code, message: pe.message, retryable: Boolean(retryable) };
  if (pe.details) body.details = pe.details;
  return body;
}

export function jobError(job: Pick<JobRecord, 'id' | 'error'> | null | undefined) {
  const e = job?.error || { code: ERROR_CODES.HOST_ERROR, message: 'job failed' };
  return new ProtocolError(e.code, e.message, { ...(e.details || {}), job_id: job?.id, retryable: e.retryable });
}
