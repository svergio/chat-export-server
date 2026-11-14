import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ERROR_CODES } from '@chat-export/protocol';
import { createMcpServer } from '../../dist/mcp/create-server.js';
import { withServer, connectMockBrowser } from '../helpers.js';

const FAST_JOBS = { jobs: { backoffMs: [10, 10, 10], pollMs: 10 } };
const REPLY = 'This is a sufficiently long assistant reply for the mock ask job to finish.';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitJob(core, jobId, statuses = ['done', 'error', 'cancelled'], timeoutMs = 5000) {
  const t0 = Date.now();
  for (;;) {
    const s = core.jobs.status(jobId);
    if (statuses.includes(s.status)) return s;
    if (Date.now() - t0 > timeoutMs) throw new Error('job stuck in ' + s.status + ': ' + jobId);
    await sleep(10);
  }
}

/** Mock chat host: create/send/get with a reply, optional per-op delay and concurrency tracking. */
function askHost({ delayMs = 0, tracker, browserId, hostState } = {}) {
  const chats = new Map();
  let n = 0;
  return async (msg) => {
    if (tracker) {
      tracker.inFlight++;
      tracker.max = Math.max(tracker.max, tracker.inFlight);
      tracker.per[browserId] = (tracker.per[browserId] || 0) + 1;
      tracker.perMax[browserId] = Math.max(tracker.perMax[browserId] || 0, tracker.per[browserId]);
    }
    try {
      if (delayMs) await sleep(delayMs);
      if (msg.op === 'platform.host_state') {
        if (hostState) return hostState(msg);
        return { ok: false, error: { code: 'HOST_ERROR', message: 'unknown op: platform.host_state' } };
      }
      if (msg.op === 'chats.create') {
        const chatId = browserId + '-c' + ++n;
        chats.set(chatId, [{ role: 'user', text: msg.args.text }]);
        return { data: { platform: msg.platform, chatId, title: msg.args.title || 't', url: 'https://x/' + chatId, updatedAt: null } };
      }
      if (msg.op === 'chats.send') {
        const list = chats.get(msg.args.chatId) || [];
        list.push({ role: 'user', text: msg.args.text });
        chats.set(msg.args.chatId, list);
        return { data: { platform: msg.platform, chatId: msg.args.chatId, title: 't', url: 'https://x', updatedAt: null } };
      }
      if (msg.op === 'chats.get') {
        const list = chats.get(msg.args.chatId) || [];
        if (list.length && list[list.length - 1].role === 'user') list.push({ role: 'assistant', text: REPLY });
        return { data: { platform: msg.platform, chatId: msg.args.chatId, title: 't', messages: list } };
      }
      return { data: {} };
    } finally {
      if (tracker) {
        tracker.inFlight--;
        tracker.per[browserId]--;
      }
    }
  };
}

async function mcpClient(core) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(core);
  await server.connect(serverTransport);
  const client = new Client({ name: 'jobs-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return {
    async call(name, args) {
      const r = await client.callTool({ name, arguments: args });
      const body = JSON.parse(r.content[0].text);
      if (r.isError) {
        const detail = body.error || body;
        const err = new Error(detail.message || body.message);
        err.code = detail.code || body.code;
        err.body = body;
        throw err;
      }
      return body;
    },
    listTools: () => client.listTools(),
    close: () => client.close()
  };
}

describe('jobs contract (mock extension)', () => {
  it('MCP jobs_enqueue/status/list/cancel + chat_ask wait:false + chats_export async:true', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      const host = askHost({ browserId: 'b-mcp' });
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-mcp',
        onRpc: async (msg) => {
          if (msg.op === 'chats.export') {
            return {
              data: {
                files: [{ name: 'grok-x.md', mime: 'text/markdown;charset=utf-8', text: '# x\n' }],
                payload: { platform: 'grok', chatId: msg.args.chatId, title: 'x', messages: [] }
              }
            };
          }
          return host(msg);
        }
      });
      const mcp = await mcpClient(core);
      try {
        const { tools } = await mcp.listTools();
        const names = tools.map((t) => t.name);
        for (const n of ['jobs_enqueue', 'jobs_status', 'jobs_list', 'jobs_cancel']) assert.ok(names.includes(n), n);
        const enqueueTool = tools.find((t) => t.name === 'jobs_enqueue');
        assert.deepEqual(enqueueTool.inputSchema.properties.kind.enum, [
          'ask',
          'export',
          'export_batch',
          'library_ingest',
          'delete',
          'delete_batch'
        ]);

        const t0 = Date.now();
        const queued = await mcp.call('jobs_enqueue', { kind: 'ask', platform: 'grok', prompt: 'ping' });
        assert.ok(Date.now() - t0 < 500);
        assert.match(queued.job_id, /^job_/);
        assert.equal(queued.lane, 'b-mcp');
        assert.equal(typeof queued.position, 'number');

        await waitJob(core, queued.job_id);
        const status = await mcp.call('jobs_status', { job_id: queued.job_id });
        assert.equal(status.status, 'done');
        assert.equal(status.result.reply.text, REPLY);
        assert.equal(status.chatId, 'b-mcp-c1');

        const asked = await mcp.call('chat_ask', { prompt: 'again', platform: 'grok', chatId: 'b-mcp-c1', wait: false });
        assert.match(asked.job_id, /^job_/);
        const askedDone = await waitJob(core, asked.job_id);
        assert.equal(askedDone.status, 'done');
        assert.ok(askedDone.result.after > 1);

        const exp = await mcp.call('chats_export', { platform: 'grok', chatId: 'e-1', formats: ['md'], async: true });
        assert.equal(exp.kind, 'export');
        const expDone = await waitJob(core, exp.job_id);
        assert.equal(expDone.status, 'done', JSON.stringify(expDone.error));
        assert.ok(fs.existsSync(expDone.result.paths[0]));

        const listed = await mcp.call('jobs_list', { kind: 'ask', limit: 10 });
        assert.equal(listed.count, 2);
        assert.equal(listed.jobs[0].result, undefined);
        assert.equal(listed.jobs[0].resultSummary.status, 'done');

        const cancelDone = await mcp.call('jobs_cancel', { job_id: queued.job_id });
        assert.equal(cancelDone.cancelled, false);

        await assert.rejects(() => mcp.call('jobs_status', { job_id: 'job_missing' }), (e) => e.code === ERROR_CODES.NOT_FOUND);
        await assert.rejects(
          () => mcp.call('jobs_enqueue', { kind: 'export', platform: 'grok', chatId: 'x' }),
          (e) => e.code === ERROR_CODES.INVALID_ARGS
        );
      } finally {
        await mcp.close();
      }
    }, FAST_JOBS);
  });

  it('two mock browsers run ask jobs in parallel; serial inside a lane; sync chat_ask never BUSY', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      const tracker = { inFlight: 0, max: 0, per: {}, perMax: {} };
      for (const browserId of ['b-a', 'b-b']) {
        await connectMockBrowser(port, {
        core,
          key,
          browserId,
          onRpc: askHost({ delayMs: 40, tracker, browserId })
        });
      }

      const t0 = Date.now();
      const a1 = core.jobs.enqueue({ kind: 'ask', platform: 'grok', browserId: 'b-a', prompt: 'a1' });
      const b1 = core.jobs.enqueue({ kind: 'ask', platform: 'chatgpt', browserId: 'b-b', prompt: 'b1' });
      const a2 = core.jobs.enqueue({ kind: 'ask', platform: 'grok', browserId: 'b-a', prompt: 'a2' });
      assert.equal(a1.lane, 'b-a');
      assert.equal(b1.lane, 'b-b');
      assert.equal(a2.position, 1);

      const results = await Promise.all([a1, b1, a2].map((j) => waitJob(core, j.job_id)));
      assert.deepEqual(
        results.map((r) => r.status),
        ['done', 'done', 'done']
      );
      assert.equal(tracker.max, 2, 'lanes overlap across browsers');
      assert.equal(tracker.perMax['b-a'], 1, 'lane b-a is serial');
      assert.equal(tracker.perMax['b-b'], 1, 'lane b-b is serial');
      assert.ok(Date.now() - t0 < 4000);

      const sync = await Promise.all([
        core.chatAsk({ prompt: 'x', platform: 'grok', browserId: 'b-a', timeout_s: 10 }),
        core.chatAsk({ prompt: 'y', platform: 'grok', browserId: 'b-a', timeout_s: 10 }),
        core.chatAsk({ prompt: 'z', platform: 'grok', browserId: 'b-b', timeout_s: 10 })
      ]);
      for (const r of sync) {
        assert.equal(r.status, 'done');
        assert.equal(r.reply.text, REPLY);
        assert.match(r.job_id, /^job_/);
      }
      assert.equal(tracker.perMax['b-a'], 1);
    }, FAST_JOBS);
  });

  it('jobs_cancel: queued job cancels immediately and never reaches the browser', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      const prompts = [];
      const host = askHost({ delayMs: 60, browserId: 'b-c' });
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-c',
        onRpc: (msg) => {
          if (msg.op === 'chats.create') prompts.push(msg.args.text);
          return host(msg);
        }
      });
      const first = core.jobs.enqueue({ kind: 'ask', platform: 'grok', prompt: 'first' });
      const second = core.jobs.enqueue({ kind: 'ask', platform: 'grok', prompt: 'second' });
      const c = core.jobs.cancel(second.job_id);
      assert.equal(c.status, 'cancelled');
      assert.equal(c.cancelled, true);
      assert.equal((await waitJob(core, first.job_id)).status, 'done');
      await sleep(50);
      assert.deepEqual(prompts, ['first']);
      assert.equal(core.jobs.status(second.job_id).status, 'cancelled');
      assert.ok(core.readAudit().some((e) => e.action === 'jobs.cancel' && e.job_id === second.job_id));
    }, FAST_JOBS);
  });

  it('ask: PLATFORM_BUSY from host_state retries with backoff then completes', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      let busyResponses = 0;
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-busy',
        onRpc: askHost({
          browserId: 'b-busy',
          hostState: () => {
            if (busyResponses < 2) {
              busyResponses++;
              return {
                ok: false,
                error: { code: 'PLATFORM_BUSY', message: 'Grok is under heavy load', details: { retryable: true } }
              };
            }
            return { data: { platform: 'grok', generating: false, busy: false, banner: null, composerReady: true } };
          }
        })
      });
      const job = core.jobs.enqueue({ kind: 'ask', platform: 'grok', browserId: 'b-busy', prompt: 'p' });
      const done = await waitJob(core, job.job_id);
      assert.equal(done.status, 'done', JSON.stringify(done.error));
      assert.equal(done.attempts, 3);
    }, FAST_JOBS);
  });

  it('offline lane stays queued until that browser connects', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, { core, key, browserId: 'b-on', onRpc: askHost({ browserId: 'b-on' }) });
      const job = core.jobs.enqueue({ kind: 'ask', platform: 'grok', browserId: 'b-late', prompt: 'p' });
      assert.equal(job.laneOnline, false);
      await sleep(50);
      assert.equal(core.jobs.status(job.job_id).status, 'queued');
      await connectMockBrowser(port, { core, key, browserId: 'b-late', onRpc: askHost({ browserId: 'b-late' }) });
      const done = await waitJob(core, job.job_id);
      assert.equal(done.status, 'done');
      assert.equal(done.chatId, 'b-late-c1');
    }, FAST_JOBS);
  });

  it('export_batch: chatIds serial with per-item results and progress', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-exp',
        onRpc: (msg) => {
          if (msg.op !== 'chats.export') return { data: {} };
          if (msg.args.chatId === 'bad') return { ok: false, error: { code: 'NOT_FOUND', message: 'gone' } };
          return {
            data: {
              files: [{ name: msg.args.chatId + '.md', mime: 'text/markdown;charset=utf-8', text: '# ' + msg.args.chatId }],
              payload: { platform: 'chatgpt', chatId: msg.args.chatId, title: msg.args.chatId, messages: [] }
            }
          };
        }
      });
      const job = core.jobs.enqueue({
        kind: 'export_batch',
        platform: 'chatgpt',
        chatIds: ['c1', 'bad', 'c2'],
        formats: ['md']
      });
      const done = await waitJob(core, job.job_id);
      assert.equal(done.status, 'done');
      assert.deepEqual(done.progress, { done: 3, total: 3, current: null });
      assert.equal(done.result.ok, 2);
      assert.equal(done.result.failed, 1);
      assert.equal(done.result.items[1].error.code, 'NOT_FOUND');
      assert.ok(fs.existsSync(done.result.items[2].paths[0]));
    }, FAST_JOBS);
  });

  it('library_ingest: chats.get fills cache without export files', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-ingest',
        onRpc: (msg) => {
          if (msg.op === 'platform.host_state') {
            return {
              data: {
                busy: true,
                code: 'RATE_LIMIT',
                kind: 'paywall',
                retryable: false,
                banner: 'Free plan',
                generating: false,
                composerReady: true
              }
            };
          }
          if (msg.op === 'chats.get') {
            return {
              data: {
                platform: 'perplexity',
                chatId: msg.args.chatId,
                title: 'ingest-' + msg.args.chatId,
                messages: [
                  { role: 'user', text: 'needleword ' + msg.args.chatId },
                  { role: 'assistant', text: 'ok' }
                ]
              }
            };
          }
          return { data: {} };
        }
      });
      const job = core.jobs.enqueue({
        kind: 'library_ingest',
        platform: 'perplexity',
        chatIds: ['i1', 'i2']
      });
      const done = await waitJob(core, job.job_id);
      assert.equal(done.status, 'done', JSON.stringify(done.error || done));
      assert.equal(done.result.ok, 2);
      assert.ok(done.result.items[0].cacheId);
      const search = core.chatsSearch({ query: 'needleword' });
      assert.ok(search.matchCount >= 2);
      assert.ok(search.hits.some((h) => h.chatId === 'i1'));
    }, FAST_JOBS);
  });

  it('export_batch: kind=paywall host_state does not block read/export', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      let exports = 0;
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-paywall-exp',
        onRpc: (msg) => {
          if (msg.op === 'platform.host_state') {
            return {
              data: {
                busy: true,
                code: 'RATE_LIMIT',
                kind: 'paywall',
                retryable: false,
                banner: 'Бесплатный план · Улучшить тариф',
                generating: false,
                composerReady: true
              }
            };
          }
          if (msg.op === 'chats.export') {
            exports++;
            return {
              data: {
                files: [
                  {
                    name: msg.args.chatId + '.md',
                    mime: 'text/markdown;charset=utf-8',
                    text: '# ' + msg.args.chatId
                  }
                ],
                payload: {
                  platform: 'perplexity',
                  chatId: msg.args.chatId,
                  title: msg.args.chatId,
                  messages: []
                }
              }
            };
          }
          return { data: {} };
        }
      });
      const job = core.jobs.enqueue({
        kind: 'export_batch',
        platform: 'perplexity',
        chatIds: ['p1', 'p2'],
        formats: ['md']
      });
      const done = await waitJob(core, job.job_id);
      assert.equal(done.status, 'done', JSON.stringify(done.error || done));
      assert.equal(exports, 2);
      assert.equal(done.result.ok, 2);
      assert.equal(done.result.failed, 0);
    }, FAST_JOBS);
  });

  it('delete_batch: kind=paywall host_state does not block delete', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      const deleted = [];
      core.updateServerSettings({ allowDestructive: true });
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-paywall-del',
        allowDestructive: true,
        onRpc: (msg) => {
          if (msg.op === 'platform.host_state') {
            return {
              data: {
                busy: true,
                code: 'RATE_LIMIT',
                kind: 'paywall',
                retryable: false,
                banner: 'Бесплатный план · Улучшить тариф',
                generating: false,
                composerReady: true
              }
            };
          }
          if (msg.op === 'chats.delete') {
            deleted.push(msg.args.chatId);
            return { data: { deleted: true, chatId: msg.args.chatId } };
          }
          return { data: {} };
        }
      });
      const job = core.jobs.enqueue({
        kind: 'delete_batch',
        platform: 'perplexity',
        chatIds: ['[ce-test]-a', 't-paywall'],
        confirm: true,
        testOnly: false
      });
      // titles unknown → assertTestChat would fetch get; with testOnly:false skip title filter
      const done = await waitJob(core, job.job_id);
      assert.equal(done.status, 'done', JSON.stringify(done.error || done));
      assert.equal(done.result.ok, 2, JSON.stringify(done.result));
      assert.equal(done.result.failed, 0);
      assert.deepEqual(deleted, ['[ce-test]-a', 't-paywall']);
    }, FAST_JOBS);
  });

  it('delete / delete_batch: reuse confirm + allowDestructive gates, [ce-test] only, audited', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      const deleted = [];
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-del',
        allowDestructive: true,
        onRpc: (msg) => {
          if (msg.op === 'chats.list') {
            return {
              data: {
                items: [
                  { platform: 'grok', chatId: 't1', title: '[ce-test] one', url: 'https://x/t1', updatedAt: null },
                  { platform: 'grok', chatId: 'real', title: 'ce-test in middle', url: 'https://x/real', updatedAt: null },
                  { platform: 'grok', chatId: 't2', title: '[ce-test] two', url: 'https://x/t2', updatedAt: null }
                ],
                nextCursor: null
              }
            };
          }
          if (msg.op === 'chats.get') {
            return { data: { platform: 'grok', chatId: msg.args.chatId, title: 'My real chat', messages: [] } };
          }
          if (msg.op === 'chats.delete') {
            deleted.push(msg.args.chatId);
            return { data: { deleted: true, chatId: msg.args.chatId } };
          }
          return { data: {} };
        }
      });

      assert.throws(
        () => core.jobs.enqueue({ kind: 'delete_batch', platform: 'grok', query: 'ce-test' }),
        (e) => e.code === ERROR_CODES.CONFIRM_REQUIRED
      );
      assert.throws(
        () => core.jobs.enqueue({ kind: 'delete', platform: 'grok', chatId: 't1', confirm: true }),
        (e) => e.code === ERROR_CODES.DESTRUCTIVE_DISABLED
      );
      core.updateServerSettings({ allowDestructive: true });

      const single = core.jobs.enqueue({ kind: 'delete', platform: 'grok', chatId: 'real', confirm: true });
      const singleDone = await waitJob(core, single.job_id);
      assert.equal(singleDone.status, 'error');
      assert.equal(singleDone.error.code, ERROR_CODES.DESTRUCTIVE_DISABLED);
      assert.deepEqual(deleted, []);

      const batch = core.jobs.enqueue({ kind: 'delete_batch', platform: 'grok', query: 'ce-test', confirm: true });
      const done = await waitJob(core, batch.job_id);
      assert.equal(done.status, 'done', JSON.stringify(done.error));
      assert.deepEqual(deleted, ['t1', 't2']);
      assert.equal(done.result.ok, 2);
      assert.equal(done.result.failed, 1);
      assert.equal(done.result.items.find((i) => i.chatId === 'real').ok, false);

      const audit = core.readAudit();
      assert.ok(audit.some((e) => e.action === 'jobs.enqueue' && e.code === ERROR_CODES.CONFIRM_REQUIRED));
      assert.ok(audit.some((e) => e.action === 'chats.delete' && e.ok === true && e.args?.chatId === 't1'));
      assert.ok(audit.some((e) => e.action === 'chats.delete' && e.reason === 'test_only'));
    }, FAST_JOBS);
  });
});
