import { ERROR_CODES, RETRYABLE_ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { toProtocolError } from '../errors.js';

export const DEFAULT_BACKOFF_MS = Object.freeze([5_000, 15_000, 45_000]);
const MAX_ATTEMPTS = 20;
const RETRYABLE_CODES = new Set(RETRYABLE_ERROR_CODES);

export class JobCancelled extends Error {
  constructor() {
    super('job cancelled');
    this.name = 'JobCancelled';
  }
}

export function isRetryable(err) {
  return Boolean(err && (RETRYABLE_CODES.has(err.code) || err.details?.retryable === true));
}

function isLaneOffline(err) {
  return err?.code === ERROR_CODES.NOT_BOUND;
}

/**
 * One async loop per browserId: serial inside a lane, parallel across lanes.
 */
export class LaneScheduler {
  /**
   * @param {{
   *   store: import('./job-store.js').JobStore,
   *   run: (job: object, ctx: object) => Promise<object>,
   *   backoffMs?: number[]
   * }} opts
   */
  constructor(opts) {
    this.store = opts.store;
    this.run = opts.run;
    this.backoffMs = opts.backoffMs || [...DEFAULT_BACKOFF_MS];
    this.hub = null;
    this.closed = false;
    /** @type {Map<string, Promise<void>>} */
    this.active = new Map();
    /** @type {Set<{ timer: NodeJS.Timeout, resolve: Function }>} */
    this.sleepers = new Set();
  }

  attachHub(hub) {
    this.hub = hub;
    this._off = hub.onBrowserConnected((browserId) => this.kick(browserId));
    for (const browserId of this.store.lanes()) this.kick(browserId);
  }

  kick(browserId) {
    if (this.closed || !this.hub || this.active.has(browserId)) return;
    if (!this.hub.isOnline(browserId)) return;
    const loop = this.#loop(browserId).finally(() => {
      this.active.delete(browserId);
      if (!this.closed && this.store.laneQueue(browserId).some((j) => j.status === 'queued')) {
        if (this.hub.isOnline(browserId)) setImmediate(() => this.kick(browserId));
      }
    });
    this.active.set(browserId, loop);
  }

  isLaneBusy(browserId) {
    return this.active.has(browserId);
  }

  async #loop(browserId) {
    while (!this.closed) {
      const job = this.store.laneQueue(browserId).find((j) => j.status === 'queued');
      if (!job) return;
      if (!this.hub.isOnline(browserId)) return;
      const keepGoing = await this.#runOne(job);
      if (!keepGoing) return;
    }
  }

  /** @returns {Promise<boolean>} false when the lane should stop (browser went offline). */
  async #runOne(job) {
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
        const result = await this.hub.runInLane(job.browserId, () => this.run(store.get(job.id), ctx));
        if (this.closed) return false;
        store.update(job.id, { status: 'done', result: result ?? null });
        return true;
      } catch (err) {
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

  #ctx(jobId) {
    const store = this.store;
    return {
      jobId,
      checkCancel: () => {
        if (this.closed || store.get(jobId)?.cancelRequested) throw new JobCancelled();
      },
      setStatus: (status) => {
        const job = store.get(jobId);
        if (job && job.status !== status) store.update(jobId, { status });
      },
      progress: (progress) => {
        const job = store.get(jobId);
        if (job) store.update(jobId, { progress: { ...job.progress, ...progress } });
      },
      saveState: (patch) => {
        const job = store.get(jobId);
        if (job) store.update(jobId, { state: { ...job.state, ...patch } });
      },
      sleep: (ms) => this.sleep(ms)
    };
  }

  sleep(ms) {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { resolve };
      entry.timer = setTimeout(() => {
        this.sleepers.delete(entry);
        resolve();
      }, ms);
      this.sleepers.add(entry);
    });
  }

  close() {
    this.closed = true;
    if (this._off) this._off();
    for (const s of this.sleepers) {
      clearTimeout(s.timer);
      s.resolve();
    }
    this.sleepers.clear();
  }
}

function errorBody(pe, retryable) {
  const body = { code: pe.code, message: pe.message, retryable: Boolean(retryable) };
  if (pe.details) body.details = pe.details;
  return body;
}

export function jobError(job) {
  const e = job?.error || { code: ERROR_CODES.HOST_ERROR, message: 'job failed' };
  return new ProtocolError(e.code, e.message, { ...(e.details || {}), job_id: job?.id, retryable: e.retryable });
}
