import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { openDatabase } from '../../dist/core/db/index.js';
import { JobStore } from '../../dist/core/jobs/job-store.js';
import { LaneScheduler } from '../../dist/core/jobs/lanes.js';
import { runJob } from '../../dist/core/jobs/runners.js';
import { ServerCore } from '../../dist/core/server-core.js';
import { tempHome } from '../helpers.js';

function waitUntil(check, timeoutMs = 3000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const v = check();
      if (v) return resolve(v);
      if (Date.now() - t0 > timeoutMs) return reject(new Error('waitUntil timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('jobs onCaptcha + ensureTab', () => {
  it('JobManager normalizes onCaptcha and ensureTab on export/ask', () => {
    const home = tempHome('ce-job-norm-');
    try {
      const core = new ServerCore({ home });
      core.acceptAdvancedMcpTos();
      const calls = [];
      const hub = {
        boundBrowserId: 'b-1',
        isOnline: () => true,
        browsers: {
          get: () => ({
            browserId: 'b-1',
            platformsEnabled: ['chatgpt'],
            allowCreate: true,
            allowDestructive: true,
            allowProjects: true
          })
        },
        onBrowserConnected: () => () => {},
        runInLane: (_id, fn) => fn()
      };
      core.setHub(hub);
      const mgr = core.jobs;
      const exp = mgr.enqueue({
        kind: 'export',
        platform: 'chatgpt',
        chatId: 'c1',
        formats: ['md'],
        onCaptcha: 'wait_human',
        ensureTab: true
      });
      const ask = mgr.enqueue({
        kind: 'ask',
        platform: 'chatgpt',
        prompt: 'hi',
        onCaptcha: 'wait_human',
        ensureTab: true
      });
      const expJob = mgr.store.get(exp.job_id);
      const askJob = mgr.store.get(ask.job_id);
      assert.equal(expJob.input.onCaptcha, 'wait_human');
      assert.equal(expJob.input.ensureTab, true);
      assert.equal(askJob.input.onCaptcha, 'wait_human');
      assert.equal(askJob.input.ensureTab, true);
      mgr.cancel(exp.job_id);
      mgr.cancel(ask.job_id);
      core.close();
      void calls;
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('export job passes onCaptcha to chatsExport and calls tabs.ensure when ensureTab', async () => {
    const home = tempHome('ce-job-run-');
    try {
      const ops = [];
      const core = {
        audit() {},
        tabsEnsure: async (platform, args) => {
          ops.push({ op: 'tabs.ensure', platform, args });
          return { ok: true };
        },
        callOp: async (op, platform, args) => {
          ops.push({ op, platform, args });
          if (op === 'platform.host_state') {
            return { busy: false, generating: false, composerReady: true };
          }
          throw new Error('unexpected ' + op);
        },
        chatsExport: async (platform, args) => {
          ops.push({ op: 'chats.export', platform, args });
          return { dir: '/tmp', paths: [], title: 't', turns: 0 };
        },
        chatsDelete: async () => ({ deleted: true }),
        chatsCreate: async () => ({ chatId: 'x' }),
        chatsSend: async () => ({}),
        chatsGet: async () => ({ messages: [] }),
        chatsList: async () => ({ items: [] }),
        resolveChatId: async (_p, id) => id
      };
      const db = openDatabase(
        { paths: { dbFile: ':memory:' }, database: { driver: 'sqlite', url: '' } },
        { file: ':memory:', migrate: true }
      );
      const store = new JobStore(db);
      const job = store.create({
        kind: 'export',
        browserId: 'b-1',
        platform: 'chatgpt',
        input: {
          chatId: 'c1',
          formats: ['md'],
          onCaptcha: 'wait_human',
          ensureTab: true
        }
      });
      const scheduler = new LaneScheduler({
        store,
        run: (j, ctx) => runJob(core, j, ctx)
      });
      scheduler.attachHub({
        isOnline: () => true,
        onBrowserConnected: () => () => {},
        runInLane: (_id, fn) => fn()
      });
      await waitUntil(() => {
        const j = store.get(job.id);
        return j && (j.status === 'done' || j.status === 'error') ? j : null;
      });
      const done = store.get(job.id);
      assert.equal(done.status, 'done', JSON.stringify(done.error));
      assert.ok(ops.some((o) => o.op === 'tabs.ensure'));
      const exportCall = ops.find((o) => o.op === 'chats.export');
      assert.ok(exportCall);
      assert.equal(exportCall.args.onCaptcha, 'wait_human');
      assert.notEqual(exportCall.args.onCaptcha, 'stop');
      scheduler.close();
      store.close();
      db.close();
      fs.rmSync(home, { recursive: true, force: true });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
