import os from 'node:os';
import { ERROR_CODES, EXPORT_FORMATS, PLATFORMS, ProtocolError } from '@chat-export/protocol';
import { assertPlatformEnabled, assertDestructiveAllowed } from '../settings.js';
import { resolveExportOutDir } from '../export-files.js';
import type { ServerCore } from '../server-core.js';
import type { LaneHub } from './lanes.js';
import { JobStore, JOB_KINDS, JOB_STATUSES, DEFAULT_JOB_TTL_MS, isTerminal, type JobRecord } from './job-store.js';
import { LaneScheduler } from './lanes.js';
import { runJob, type RunnerCore } from './runners.js';

export { JobStore, JOB_KINDS, JOB_STATUSES, isTerminal } from './job-store.js';
export { LaneScheduler, JobCancelled, isRetryable, jobError, DEFAULT_BACKOFF_MS } from './lanes.js';
export { runJob, TEST_PREFIX } from './runners.js';

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const ASK_OPTION_KEYS = [
  'title',
  'model',
  'mode',
  'toggles',
  'tools',
  'files',
  'onCaptcha',
  'ensureTab'
] as const;

export function clampAskTimeout(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 90;
  return Math.min(300, Math.max(10, Math.trunc(n)));
}

function invalid(message: string, details?: Record<string, unknown>): never {
  throw new ProtocolError(ERROR_CODES.INVALID_ARGS, message, details);
}

function requireFormats(formats: unknown): string[] {
  if (!Array.isArray(formats) || !formats.length || formats.some((f) => !EXPORT_FORMATS.includes(f))) {
    invalid('formats required: ' + EXPORT_FORMATS.join('|'));
  }
  return [...new Set(formats.map(String))];
}

function nonEmptyIds(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
}

export function publicJob(job: JobRecord, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    job_id: job.id,
    kind: job.kind,
    browserId: job.browserId,
    platform: job.platform,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    attempts: job.attempts,
    cancelRequested: Boolean(job.cancelRequested),
    retryAt: job.retryAt || null,
    chatId: job.result?.chatId || job.state?.chatId || job.input?.chatId || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...extra
  };
}

function summaryJob(job: JobRecord, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { result, ...rest } = publicJob(job, extra);
  const row = rest as Record<string, unknown>;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    row.resultSummary = {
      status: r.status,
      total: r.total,
      ok: r.ok,
      failed: r.failed,
      paths: Array.isArray(r.paths) ? r.paths.length : undefined
    };
  }
  return row;
}

export interface JobManagerOptions {
  db?: import('../../types.js').DatabaseAdapter;
  backoffMs?: number[];
  pollMs?: number;
  ttlMs?: number;
}

export type EnqueueSpec = { kind: string; platform: string; browserId?: string } & Record<string, unknown>;

export class JobManager {
  core: ServerCore;
  options: { pollMs?: number; ttlMs: number };
  store: JobStore;
  scheduler: LaneScheduler;
  started = false;
  private _pruneTimer?: ReturnType<typeof setInterval>;

  constructor(core: ServerCore, opts: JobManagerOptions = {}) {
    this.core = core;
    this.options = { pollMs: opts.pollMs, ttlMs: opts.ttlMs ?? DEFAULT_JOB_TTL_MS };
    this.store = new JobStore(opts.db || core.db);
    this.scheduler = new LaneScheduler({
      store: this.store,
      backoffMs: opts.backoffMs,
      run: (job, ctx) => runJob(this.core as RunnerCore, job, ctx, this.options)
    });
  }

  attachHub(hub: LaneHub): void {
    if (this.started) return;
    this.started = true;
    this.store.recover();
    this.store.prune(this.options.ttlMs);
    this._pruneTimer = setInterval(() => this.store.prune(this.options.ttlMs), PRUNE_INTERVAL_MS);
    this._pruneTimer.unref?.();
    this.scheduler.attachHub(hub);
  }

  #resolveLane(browserId?: string): string {
    const hub = this.core.hub;
    if (!hub) throw new ProtocolError(ERROR_CODES.HOST_ERROR, 'browser hub not attached');
    if (browserId) return String(browserId);
    if (!hub.boundBrowserId) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'no browser bound; pass browserId or bind a browser');
    }
    return hub.boundBrowserId;
  }

  #normalize(spec: EnqueueSpec): Record<string, unknown> {
    const kind = spec.kind;
    const input: Record<string, unknown> = {};
    if (kind === 'ask') {
      const prompt = String(spec.prompt || '').trim();
      if (!prompt) invalid('prompt required');
      input.prompt = prompt;
      if (spec.chatId) input.chatId = String(spec.chatId);
      input.timeout_s = clampAskTimeout(spec.timeout_s);
      for (const k of ASK_OPTION_KEYS) if (spec[k] !== undefined) input[k] = spec[k];
      return input;
    }
    if (kind === 'export' || kind === 'export_batch') {
      input.formats = requireFormats(spec.formats);
      if (spec.outDir !== undefined && spec.outDir !== '') {
        resolveExportOutDir(String(spec.outDir), os.homedir());
        input.outDir = spec.outDir;
      }
      if (spec.branch !== undefined) input.branch = spec.branch;
      if (spec.schema !== undefined) input.schema = String(spec.schema);
      if (spec.onCaptcha !== undefined) input.onCaptcha = spec.onCaptcha;
      if (spec.ensureTab !== undefined) input.ensureTab = spec.ensureTab === true;
    }
    if (kind === 'delete' || kind === 'delete_batch') {
      input.confirm = spec.confirm === true;
      input.testOnly = spec.testOnly !== false;
      if (spec.onCaptcha !== undefined) input.onCaptcha = spec.onCaptcha;
      if (spec.ensureTab !== undefined) input.ensureTab = spec.ensureTab === true;
    }
    if (kind === 'export' || kind === 'delete') {
      if (!spec.chatId) invalid('chatId required for ' + kind);
      input.chatId = String(spec.chatId);
      return input;
    }
    const chatIds = nonEmptyIds(spec.chatIds);
    const query = typeof spec.query === 'string' ? spec.query.trim() : '';
    if (!chatIds.length && !query) invalid(kind + ' needs chatIds[] or query');
    if (chatIds.length) input.chatIds = chatIds;
    else input.query = query;
    if (spec.max !== undefined) input.max = spec.max;
    return input;
  }

  #gate(kind: string, platform: string, browserId: string, input: Record<string, unknown>): void {
    const hub = this.core.hub;
    if (!hub) throw new ProtocolError(ERROR_CODES.HOST_ERROR, 'browser hub not attached');
    const browser = hub.browsers.get(browserId) || null;
    assertPlatformEnabled(platform, this.core.config.settings, browser);
    if (kind !== 'delete' && kind !== 'delete_batch') return;
    try {
      assertDestructiveAllowed('chats.delete', this.core.config.settings, browser, {
        confirm: input.confirm === true
      });
    } catch (err: any) {
      this.core.audit({
        action: 'jobs.enqueue',
        kind,
        platform,
        browserId,
        ok: false,
        code: err.code,
        confirm: input.confirm
      });
      throw err;
    }
  }

  enqueue(spec: EnqueueSpec = { kind: '', platform: '' }) {
    if (!(JOB_KINDS as readonly string[]).includes(spec.kind)) {
      invalid('kind must be one of ' + JOB_KINDS.join('|'));
    }
    if (!(PLATFORMS as readonly string[]).includes(spec.platform)) {
      invalid('invalid platform', { hint: 'pass platform: ' + PLATFORMS.join('|') });
    }
    const input = this.#normalize(spec);
    const browserId = this.#resolveLane(spec.browserId);
    this.#gate(spec.kind, spec.platform, browserId, input);
    const job = this.store.create({ kind: spec.kind, platform: spec.platform, browserId, input });
    this.core.audit({
      action: 'jobs.enqueue',
      job_id: job.id,
      kind: job.kind,
      platform: job.platform,
      browserId,
      ok: true
    });
    this.scheduler.kick(browserId);
    const hub = this.core.hub;
    return {
      job_id: job.id,
      kind: job.kind,
      lane: browserId,
      position: this.position(job.id),
      status: this.store.get(job.id)?.status,
      laneOnline: hub ? hub.isOnline(browserId) : false
    };
  }

  position(jobId: string): number | null {
    const job = this.store.get(jobId);
    if (!job || isTerminal(job.status)) return null;
    return this.store.laneQueue(job.browserId).findIndex((j) => j.id === jobId);
  }

  #require(jobId: string): JobRecord {
    const job = this.store.get(jobId);
    if (!job) throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'job not found: ' + jobId);
    return job;
  }

  status(jobId: string) {
    const job = this.#require(jobId);
    return publicJob(job, { position: this.position(jobId), input: job.input });
  }

  list(filter: { status?: string; kind?: string; browserId?: string; limit?: number } = {}) {
    if (filter.status && !(JOB_STATUSES as readonly string[]).includes(filter.status)) {
      invalid('status must be one of ' + JOB_STATUSES.join('|'));
    }
    const jobs = this.store.list(filter);
    return { jobs: jobs.map((j) => summaryJob(j, { position: this.position(j.id) })), count: jobs.length };
  }

  cancel(jobId: string) {
    const job = this.#require(jobId);
    if (isTerminal(job.status)) return { job_id: jobId, status: job.status, cancelled: false };
    if (job.status === 'queued') {
      this.store.update(jobId, { status: 'cancelled', cancelRequested: true });
      this.core.audit({ action: 'jobs.cancel', job_id: jobId, ok: true });
      return { job_id: jobId, status: 'cancelled', cancelled: true };
    }
    this.store.update(jobId, { cancelRequested: true });
    this.core.audit({ action: 'jobs.cancel', job_id: jobId, ok: true, requested: true });
    return { job_id: jobId, status: this.store.get(jobId)?.status, cancelled: 'requested' as const };
  }

  waitFor(jobId: string, timeoutMs: number): Promise<JobRecord | null> {
    const job = this.#require(jobId);
    if (isTerminal(job.status)) return Promise.resolve(job);
    return new Promise((resolve) => {
      const onUpdate = (j: JobRecord) => {
        if (j.id !== jobId || !isTerminal(j.status)) return;
        done();
      };
      const done = () => {
        clearTimeout(timer);
        this.store.off('update', onUpdate);
        resolve(this.store.get(jobId));
      };
      const timer = setTimeout(done, timeoutMs);
      this.store.on('update', onUpdate);
    });
  }

  close(): void {
    if (this._pruneTimer) clearInterval(this._pruneTimer);
    this.scheduler.close();
    this.store.close();
  }
}
