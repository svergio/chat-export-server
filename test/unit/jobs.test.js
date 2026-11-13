import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { openDatabase } from '../../dist/core/db/index.js';
import { JobStore } from '../../dist/core/jobs/job-store.js';
import { LaneScheduler } from '../../dist/core/jobs/lanes.js';

function withDb(fn) {
  const db = openDatabase(
    { paths: { dbFile: ':memory:' }, database: { driver: 'sqlite', url: '' } },
    { file: ':memory:', migrate: true }
  );
  return Promise.resolve()
    .then(() => fn(db))
    .finally(() => db.close());
}

function waitUntil(check, timeoutMs = 2000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const v = check();
      if (v) return resolve(v);
      if (Date.now() - t0 > timeoutMs) return reject(new Error('waitUntil timeout'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

function fakeHub(online = new Set(['b-1'])) {
  const listeners = new Set();
  return {
    online,
    isOnline: (id) => online.has(id),
    onBrowserConnected: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    connect(id) {
      online.add(id);
      for (const fn of listeners) fn(id);
    },
    runInLane: (_id, fn) => fn()
  };
}

describe('JobStore (sqlite)', () => {
  it('create, claim, recover, prune', () =>
    withDb((db) => {
      const store = new JobStore(db);
      const a = store.create({ kind: 'export', browserId: 'b1', platform: 'chatgpt', input: { chatId: 'c1' } });
      const b = store.create({ kind: 'ask', browserId: 'b1', platform: 'grok', input: { prompt: 'x' } });
      assert.deepEqual(store.laneQueue('b1').map((j) => j.id), [a.id, b.id]);
      assert.equal(store.claim(a.id)?.status, 'assigned');
      assert.equal(store.claim(a.id), null);
      store.update(a.id, { status: 'running', state: { x: 1 }, progress: { done: 1, total: 2, current: 'q' } });
      store.update(b.id, { status: 'waiting_host' });
      const recovered = store.recover();
      assert.deepEqual(new Set(recovered), new Set([a.id, b.id]));
      assert.equal(store.get(a.id).status, 'queued');
      store.update(a.id, { status: 'done', result: { chatId: 'c9' } });
      assert.equal(store.get(a.id).chatId, 'c9');
      assert.deepEqual(store.lanes(), ['b1']);
      const removed = store.prune(0);
      assert.ok(removed.includes(a.id));
      assert.equal(store.get(a.id), null);
    }));

  it('list filters and orders newest first', () =>
    withDb((db) => {
      let now = 1_000_000;
      const store = new JobStore(db, { now: () => now++ });
      const a = store.create({ kind: 'ask', browserId: 'b-1', platform: 'grok' });
      const b = store.create({ kind: 'export', browserId: 'b-2', platform: 'grok' });
      assert.deepEqual(
        store.list().map((j) => j.id),
        [b.id, a.id]
      );
      assert.deepEqual(
        store.list({ kind: 'ask' }).map((j) => j.id),
        [a.id]
      );
    }));
});

describe('LaneScheduler', () => {
  it('cancel: running job stops between steps', () =>
    withDb(async (db) => {
      const store = new JobStore(db);
      const scheduler = new LaneScheduler({
        store,
        run: async (_job, ctx) => {
          for (;;) {
            ctx.checkCancel();
            await ctx.sleep(5);
          }
        }
      });
      scheduler.attachHub(fakeHub());
      const job = store.create({ kind: 'ask', browserId: 'b-1', platform: 'grok' });
      scheduler.kick('b-1');
      await waitUntil(() => store.get(job.id).status === 'running');
      store.update(job.id, { cancelRequested: true });
      await waitUntil(() => store.get(job.id).status === 'cancelled');
      scheduler.close();
    }));

  it('retryable PLATFORM_BUSY backs off then succeeds; state survives retries', () =>
    withDb(async (db) => {
      const store = new JobStore(db);
      let calls = 0;
      const scheduler = new LaneScheduler({
        store,
        backoffMs: [5, 5, 5],
        run: async (job, ctx) => {
          calls++;
          if (!job.state.sent) ctx.saveState({ sent: true });
          if (calls < 3) {
            throw new ProtocolError(ERROR_CODES.PLATFORM_BUSY, 'heavy load', { retryable: true });
          }
          return { ok: true, sentOnce: job.state.sent };
        }
      });
      scheduler.attachHub(fakeHub());
      const job = store.create({ kind: 'ask', browserId: 'b-1', platform: 'grok' });
      scheduler.kick('b-1');
      await waitUntil(() => store.get(job.id).status === 'done');
      assert.equal(calls, 3);
      assert.equal(store.get(job.id).attempts, 3);
      assert.deepEqual(store.get(job.id).result, { ok: true, sentOnce: true });
      scheduler.close();
    }));

  it('offline lane keeps job queued; reconnect resumes', () =>
    withDb(async (db) => {
      const store = new JobStore(db);
      const hub = fakeHub(new Set());
      const scheduler = new LaneScheduler({
        store,
        run: async () => ({ ok: true })
      });
      scheduler.attachHub(hub);
      const a = store.create({ kind: 'ask', browserId: 'b-1', platform: 'grok' });
      scheduler.kick('b-1');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(store.get(a.id).status, 'queued');
      hub.connect('b-1');
      await waitUntil(() => store.get(a.id).status === 'done');
      scheduler.close();
    }));
});

describe('sqlite WAL bus', () => {
  it('opens WAL db with expected tables', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-db-'));
    const dbFile = path.join(home, 'data', 'chat-export.db');
    const db = openDatabase(
      { home, paths: { dbFile }, database: { driver: 'sqlite', url: '' } },
      { migrate: true }
    );
    try {
      assert.equal(db.get('PRAGMA journal_mode').journal_mode, 'wal');
      const names = db.all("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").map((r) => r.name);
      for (const n of [
        'mcp_tokens',
        'browsers',
        'jobs',
        'idx_jobs_lane_status',
        'cached_chats',
        'cached_chat_blocks',
        'cached_chat_fts',
        'metrics_log',
        'tab_snapshots'
      ]) {
        assert.ok(names.includes(n), 'missing ' + n);
      }
      assert.ok(fs.existsSync(dbFile));
    } finally {
      db.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
