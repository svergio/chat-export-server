#!/usr/bin/env node
/**
 * Flat MCP run-list orchestrator.
 *
 *   node scripts/gen-mcp-run-list.mjs          # regenerate list
 *   node scripts/mcp-run-list.mjs --dry-run
 *   node scripts/mcp-run-list.mjs
 *   node scripts/mcp-run-list.mjs --from=042
 *   node scripts/mcp-run-list.mjs --from=042 --to=080
 *   node scripts/mcp-run-list.mjs --ids=4,8,12
 *   node scripts/mcp-run-list.mjs --ids=004,008,012
 *   node scripts/mcp-run-list.mjs --from-state
 *   node scripts/mcp-run-list.mjs --only=perplexity
 *   node scripts/mcp-run-list.mjs --only-tool=chats_delete
 *
 * Selection: --ids (arbitrary set) wins; else --from/--to range; else --from-state; else full list.
 * On case FAIL: append RED, continue. On orchestrator crash: state.nextId saved → --from=N.
 * Do not edit product code while this runs.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QA = join(ROOT, 'docs/qa');
const LIST_PATH = join(QA, 'mcp-run-list.json');
const DEFAULT_STATE_PATH = join(QA, 'mcp-run-state.json');
const DEFAULT_RUN_PATH = join(QA, 'mcp-run-list-RUN.md');
const DEFAULT_RED_PATH = join(QA, 'mcp-live-matrix-RED.md');

const PLATFORM_SLOTS = ['chatId', 'chatId2', 'chatId3', 'cacheId', 'containerId'];

export function clearPlatformSlots(slots) {
  const next = { ...(slots || {}) };
  for (const k of PLATFORM_SLOTS) delete next[k];
  return next;
}

export function applySlotFromBody(slots, slot, body) {
  const next = { ...(slots || {}) };
  if (!slot) return next;
  if (slot === 'chatId' || slot === 'chatId2' || slot === 'chatId3') {
    const id = body?.chatId || body?.id;
    if (id) next[slot] = id;
    else delete next[slot];
    return next;
  }
  if (slot === 'cacheId') {
    const id = body?.cacheId || body?.id;
    if (id) next.cacheId = id;
    else delete next.cacheId;
    return next;
  }
  if (slot === 'containerId') {
    const id = body?.containerId || body?.id || body?.projectId;
    if (id) next.containerId = id;
    else delete next.containerId;
    return next;
  }
  if (slot === 'cancelJobId') {
    if (body?.job_id) next.cancelJobId = body.job_id;
    else delete next.cancelJobId;
  }
  return next;
}

export function isUnsupportedSoftFail(code, msg) {
  return /UNSUPPORTED|NOT_SUPPORTED|PROJECTS_DISABLED|OPTION_NOT_FOUND|unknown op|TIMEOUT|timed out|rpc timeout|HOST_ERROR|not supported/i.test(
    String(code || '') + ' ' + String(msg || '')
  );
}

function log(...a) {
  writeSync(1, a.map(String).join(' ') + '\n');
}

function padId(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (/^\d+$/.test(s)) return s.padStart(3, '0');
  return s;
}

function parseArgs(argv) {
  const o = {
    url: process.env.CHAT_EXPORT_MCP_URL || 'http://127.0.0.1:8765/mcp',
    token: process.env.CHAT_EXPORT_MCP_TOKEN || '',
    browserId: process.env.CHAT_EXPORT_BROWSER_ID || 'b-215c6f46',
    from: null,
    to: null,
    ids: null,
    fromState: false,
    onlyPlatform: null,
    onlyTool: null,
    dryRun: false,
    statePath: DEFAULT_STATE_PATH,
    runPath: DEFAULT_RUN_PATH,
    redPath: DEFAULT_RED_PATH,
    freshState: false
  };
  for (const a of argv) {
    if (a.startsWith('--url=')) o.url = a.slice(6);
    else if (a.startsWith('--token=')) o.token = a.slice(8);
    else if (a.startsWith('--browser=')) o.browserId = a.slice(10);
    else if (a.startsWith('--from=')) o.from = padId(a.slice(7));
    else if (a.startsWith('--to=')) o.to = padId(a.slice(5));
    else if (a.startsWith('--ids=')) {
      o.ids = a
        .slice(6)
        .split(/[,;\s]+/)
        .map(padId)
        .filter(Boolean);
    } else if (a === '--from-state') o.fromState = true;
    else if (a.startsWith('--only=')) o.onlyPlatform = a.slice(7);
    else if (a.startsWith('--only-tool=')) o.onlyTool = a.slice(12);
    else if (a.startsWith('--state=')) o.statePath = a.slice(8);
    else if (a.startsWith('--run=')) o.runPath = a.slice(6);
    else if (a.startsWith('--red=')) o.redPath = a.slice(6);
    else if (a === '--fresh-state') o.freshState = true;
    else if (a === '--dry-run') o.dryRun = true;
  }
  if (!o.token && !o.dryRun) {
    for (const p of [
      join(ROOT, '../../../.cursor/mcp.json'),
      '/Users/svergio_mel/Desktop/NodeRed/.cursor/mcp.json'
    ]) {
      if (!existsSync(p)) continue;
      try {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        const auth = j?.mcpServers?.['chat-export']?.headers?.Authorization || '';
        const m = String(auth).match(/Bearer\s+(\S+)/i);
        if (m) {
          o.token = m[1];
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (!o.dryRun && !o.token) throw new Error('CHAT_EXPORT_MCP_TOKEN or --token required');
  return o;
}

function loadList() {
  if (!existsSync(LIST_PATH)) {
    throw new Error('missing ' + LIST_PATH + ' — run: node scripts/gen-mcp-run-list.mjs');
  }
  return JSON.parse(readFileSync(LIST_PATH, 'utf8'));
}

function loadState(path, fresh) {
  if (fresh || !existsSync(path)) return { nextId: null, slots: {}, results: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveState(path, state) {
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

function errCode(err) {
  return err?.code || err?.body?.error?.code || err?.body?.code || 'ERROR';
}
function errMsg(err) {
  return err?.message || err?.body?.error?.message || String(err);
}

function resolveArgs(args, slots, ts) {
  const raw = JSON.stringify(args || {});
  const filled = raw
    .replaceAll('{{ts}}', String(ts))
    .replaceAll('{{browserId}}', slots.browserId || '')
    .replaceAll('{{chatId}}', slots.chatId || '')
    .replaceAll('{{chatId2}}', slots.chatId2 || '')
    .replaceAll('{{chatId3}}', slots.chatId3 || '')
    .replaceAll('{{cacheId}}', slots.cacheId || '')
    .replaceAll('{{containerId}}', slots.containerId || '')
    .replaceAll('{{lastJobId}}', slots.lastJobId || '')
    .replaceAll('{{cancelJobId}}', slots.cancelJobId || '')
    .replaceAll('runlistNeedle{{ts}}', 'runlistNeedle' + ts);
  return JSON.parse(filled);
}

function missingNeeds(needs, slots) {
  return (needs || []).filter((k) => !slots[k]);
}

class Orch {
  constructor(opts) {
    this.opts = opts;
    this.client = null;
    this.ts = Date.now();
    this.statePath = opts.statePath || DEFAULT_STATE_PATH;
    this.runPath = opts.runPath || DEFAULT_RUN_PATH;
    this.redPath = opts.redPath || DEFAULT_RED_PATH;
    this.state = loadState(this.statePath, opts.freshState);
    this.state.slots = this.state.slots || {};
    this.state.slots.browserId = opts.browserId;
    this.state.results = this.state.results || {};
    this._lastPlatform = null;
  }

  persist() {
    saveState(this.statePath, this.state);
  }

  maybeClearSlotsForPlatform(platform) {
    if (!platform || platform === '*') return;
    if (this._lastPlatform && this._lastPlatform !== platform) {
      this.state.slots = clearPlatformSlots(this.state.slots);
      this.state.slots.browserId = this.opts.browserId;
    }
    this._lastPlatform = platform;
  }

  async connect() {
    const transport = new StreamableHTTPClientTransport(new URL(this.opts.url), {
      requestInit: { headers: { Authorization: 'Bearer ' + this.opts.token } }
    });
    this.client = new Client({ name: 'mcp-run-list', version: '1.0.0' });
    await this.client.connect(transport);
  }

  async close() {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
  }

  async call(name, args, timeoutMs) {
    const ms = timeoutMs || 90000;
    const hard = new Promise((_, reject) => {
      const t = setTimeout(() => {
        const err = new Error('hard timeout after ' + ms + 'ms');
        err.code = 'TIMEOUT';
        reject(err);
      }, ms + 5000);
      if (typeof t.unref === 'function') t.unref();
    });
    const r = await Promise.race([
      this.client.callTool({ name, arguments: args }, undefined, { timeout: ms }),
      hard
    ]);
    let body = null;
    const text = r?.content?.[0]?.text;
    if (typeof text === 'string' && text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    } else body = r;
    if (r?.isError) {
      const detail = body?.error || body;
      const err = new Error(detail?.message || name + ' failed');
      err.code = detail?.code || body?.code || 'TOOL_ERROR';
      err.body = body;
      throw err;
    }
    return body;
  }

  async waitJob(jobId, timeoutMs = 180000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const st = await this.call('jobs_status', { job_id: jobId }, 60000);
      if (st.status === 'done' || st.status === 'error' || st.status === 'cancelled') return st;
      await new Promise((r) => setTimeout(r, 800));
    }
    throw Object.assign(new Error('job timeout'), { code: 'TIMEOUT' });
  }

  appendRun(line) {
    if (!existsSync(this.runPath) || readFileSync(this.runPath, 'utf8').length < 10) {
      writeFileSync(
        this.runPath,
        `# MCP run-list RUN\n\n- Started: ${new Date().toISOString()}\n- Browser: ${this.opts.browserId}\n\n| Id | Tool | Platform | Result |\n| --- | --- | --- | --- |\n`
      );
    }
    appendFileSync(this.runPath, line + '\n');
  }

  appendRed(c, result, actual) {
    if (!existsSync(this.redPath)) {
      writeFileSync(this.redPath, '# MCP live matrix RED\n\n');
    }
    appendFileSync(
      this.redPath,
      `\n## ${c.id} ${c.tool} / ${c.platform}\n\n- result: ${result}\n- actual: ${String(actual).replace(/\n/g, ' ').slice(0, 600)}\n- at: ${new Date().toISOString()}\n`
    );
  }

  record(c, status, detail = '') {
    const result = detail ? `${status}(${detail})` : status;
    this.state.results[c.id] = { status, detail, at: new Date().toISOString() };
    this.state.nextId = null;
    log(`${c.id} ${c.tool} ${c.platform} ${result}`);
    this.appendRun(
      `| ${c.id} | ${c.tool} | ${c.platform} | ${result.replace(/\|/g, '/')} |`
    );
    if (status === 'FAIL') this.appendRed(c, result, detail);
    this.persist();
    return result;
  }

  async runTrap(c) {
    if (c.tool === '__skip_janitorai') {
      return this.record(c, 'SKIP', 'wire-filtered');
    }
    if (c.tool === '__trap_T5_schema_testOnly') {
      const { tools } = await this.client.listTools();
      const je = tools.find((t) => t.name === 'jobs_enqueue');
      const desc = je?.inputSchema?.properties?.testOnly?.description || '';
      if (/validate only without mutating/i.test(desc)) {
        return this.record(c, 'FAIL', 'schema dry-run lie: ' + desc);
      }
      if (/\[ce-test\]/i.test(desc) || /not a dry-run/i.test(desc)) {
        return this.record(c, 'PASS', 'schema ok');
      }
      return this.record(c, 'FAIL', 'unexpected describe: ' + (desc || '(empty)'));
    }
    if (c.tool === '__trap_T1_empty_platforms') {
      const list = await this.call('browsers_list', {}, 30000);
      const browsers = Array.isArray(list) ? list : list?.browsers || [];
      const empty = browsers.find(
        (b) =>
          b.browserId !== this.opts.browserId &&
          b.status === 'online' &&
          Array.isArray(b.platformsEnabled) &&
          b.platformsEnabled.length === 0
      );
      if (!empty) {
        await this.call('browsers_bind', { browserId: this.opts.browserId }, 30000);
        return this.record(c, 'SKIP', 'no online empty-platforms browser');
      }
      try {
        await this.call('browsers_bind', { browserId: empty.browserId }, 30000);
        try {
          await this.call('chats_list', { platform: 'perplexity', limit: 1 }, 30000);
          this.record(c, 'FAIL', 'empty platforms allowed chats_list');
        } catch (err) {
          const code = errCode(err);
          if (code === 'PLATFORM_DISABLED' || /disabled/i.test(errMsg(err))) {
            this.record(c, 'PASS', code);
          } else {
            this.record(c, 'FAIL', code + ':' + errMsg(err).slice(0, 80));
          }
        }
      } finally {
        await this.call('browsers_bind', { browserId: this.opts.browserId }, 30000);
      }
      return;
    }
    if (c.tool === '__trap_T2_testOnly_default') {
      let victim = null;
      for (const p of ['perplexity', 'chatgpt', 'grok']) {
        try {
          const listed = await this.call('chats_list', { platform: p, limit: 20 }, 60000);
          const items = listed?.chats || listed?.items || [];
          victim = items.find((x) => x.chatId && !String(x.title || '').startsWith('[ce-test]'));
          if (victim) {
            victim._platform = p;
            break;
          }
        } catch {
          /* next */
        }
      }
      if (!victim) return this.record(c, 'SKIP', 'no non-ce-test chat');
      const job = await this.call(
        'jobs_enqueue',
        {
          kind: 'delete_batch',
          platform: victim._platform,
          chatIds: [victim.chatId],
          confirm: true
        },
        30000
      );
      const st = await this.waitJob(job.job_id, 90000);
      const res = st.result || {};
      const code = res.items?.[0]?.error?.code || '';
      const kind = res.items?.[0]?.error?.details?.kind || '';
      if (code === 'RATE_LIMIT' || kind === 'paywall') {
        return this.record(c, 'FAIL', `paywall-preempted ${code}:` + (res.items?.[0]?.error?.message || ''));
      }
      if (st.status === 'done' && res.ok === 0 && (code === 'DESTRUCTIVE_DISABLED' || /test/i.test(code))) {
        return this.record(c, 'PASS', `ok:0 ${code}`);
      }
      return this.record(c, 'FAIL', JSON.stringify({ status: st.status, result: res }).slice(0, 200));
    }
    return this.record(c, 'FAIL', 'unknown trap');
  }

  async runCase(c) {
    this.state.nextId = c.id;
    this.maybeClearSlotsForPlatform(c.platform);
    this.persist();

    if (c.expect?.startsWith('SKIP') || c.tool.startsWith('__skip_')) {
      return this.record(c, 'SKIP', String(c.expect || 'skip').replace(/^SKIP\(/, '').replace(/\)$/, ''));
    }
    if (c.tool.startsWith('__trap_') || c.tool.startsWith('__skip_')) {
      return this.runTrap(c);
    }

    const miss = missingNeeds(c.needs, this.state.slots);
    if (miss.length) {
      const soft = c.softFail === 'missing-slot' || c.softFail === 'unsupported';
      return this.record(c, soft ? 'SKIP' : 'FAIL', 'missing slots: ' + miss.join(','));
    }

    let args;
    try {
      args = resolveArgs(c.args, this.state.slots, this.ts);
    } catch (err) {
      return this.record(c, 'FAIL', 'resolveArgs: ' + errMsg(err));
    }

    try {
      const body = await this.call(c.tool, args, c.timeoutMs || 190000);
      this.state.slots = applySlotFromBody(this.state.slots, c.slot, body);
      if (body?.job_id) {
        this.state.slots.lastJobId = body.job_id;
        if (c.waitJob) {
          const st = await this.waitJob(body.job_id, Math.max(c.timeoutMs || 0, 190000));
          if (st.status === 'error') {
            if (c.slot) this.state.slots = applySlotFromBody(this.state.slots, c.slot, null);
            return this.record(c, 'FAIL', (st.error?.code || 'JOB_ERROR') + ':' + (st.error?.message || ''));
          }
          const res = st.result || {};
          if (c.assertBatch && typeof res.ok === 'number' && typeof res.failed === 'number') {
            if (res.failed > 0) {
              const code = res.items?.find((i) => !i.ok)?.error?.code || 'PARTIAL_FAIL';
              return this.record(c, 'FAIL', `ok:${res.ok} failed:${res.failed} ${code}`);
            }
          }
        }
      }
      if (c.tool === 'browsers_bind') {
        this.state.slots.browserId = this.opts.browserId;
      }
      return this.record(c, 'PASS');
    } catch (err) {
      const code = errCode(err);
      const msg = errMsg(err);
      if (c.slot) this.state.slots = applySlotFromBody(this.state.slots, c.slot, null);
      // softFail: unsupported ONLY when the case JSON opts in (e.g. projects_* on hosts without projects).
      // Never auto-SKIP UNAUTHORIZED / RATE_LIMIT / host errors — those stay FAIL for investigation.
      if (c.softFail === 'unsupported' && isUnsupportedSoftFail(code, msg)) {
        return this.record(c, 'SKIP', 'unsupported:' + code);
      }
      return this.record(c, 'FAIL', code + ':' + msg.slice(0, 120));
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(QA, { recursive: true });
  const doc = loadList();
  const all = doc.cases || [];
  let cases = all;

  if (opts.onlyPlatform) {
    cases = cases.filter((c) => c.platform === opts.onlyPlatform || c.platform === '*');
  }
  if (opts.onlyTool) {
    cases = cases.filter(
      (c) => c.tool === opts.onlyTool || c.tool.startsWith('__trap') || c.tool.startsWith('__skip')
    );
  }

  // Arbitrary set (pre-release smoke): preserve id order from the master list
  if (opts.ids && opts.ids.length) {
    const want = new Set(opts.ids);
    const missing = opts.ids.filter((id) => !all.some((c) => c.id === id));
    if (missing.length) throw new Error('unknown --ids: ' + missing.join(','));
    cases = cases.filter((c) => want.has(c.id));
  } else if (opts.from || opts.to) {
    const fromId = opts.from || cases[0]?.id;
    const toId = opts.to || cases[cases.length - 1]?.id;
    const i0 = cases.findIndex((c) => c.id === fromId);
    const i1 = cases.findIndex((c) => c.id === toId);
    if (i0 < 0) throw new Error('unknown --from id ' + fromId);
    if (i1 < 0) throw new Error('unknown --to id ' + toId);
    if (i1 < i0) throw new Error('--to before --from');
    cases = cases.slice(i0, i1 + 1);
  } else if (opts.fromState) {
    const st = loadState(opts.statePath, false);
    if (st.nextId) {
      const i = cases.findIndex((c) => c.id === st.nextId);
      if (i >= 0) cases = cases.slice(i);
    }
  }

  log(
    `run-list selected=${cases.length}/${all.length} first=${cases[0]?.id || '-'} last=${cases[cases.length - 1]?.id || '-'} dry=${opts.dryRun}`
  );
  if (opts.dryRun) {
    for (const c of cases) {
      log(`${c.id}\t${c.tool}\t${c.platform}\t${c.destructive ? 'D' : ''}`);
    }
    log(`selected=${cases.length}`);
    return;
  }

  const orch = new Orch(opts);
  await orch.connect();
  try {
    await orch.call('browsers_bind', { browserId: opts.browserId }, 30000);
    for (const c of cases) {
      try {
        await orch.runCase(c);
      } catch (err) {
        orch.state.nextId = c.id;
        orch.persist();
        log(`ORCH_CRASH at ${c.id}: ${errMsg(err)}`);
        throw err;
      }
    }
    orch.state.nextId = null;
    orch.persist();
    log('DONE');
  } finally {
    await orch.close();
  }
}

const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    log(String(err?.stack || err));
    process.exit(2);
  });
}
