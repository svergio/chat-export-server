#!/usr/bin/env node
/**
 * Generate docs/qa/mcp-run-list.json — flat tool×platform run list.
 *   node scripts/gen-mcp-run-list.mjs
 *
 * Client timeoutMs must be >= server rpcTimeoutMs (default 180s in ~/.chat-export/config.json).
 * Override floor via CHAT_EXPORT_RPC_TIMEOUT_MS.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/qa/mcp-run-list.json');

const RPC_FLOOR_MS = Math.max(
  190_000,
  Number(process.env.CHAT_EXPORT_RPC_TIMEOUT_MS || 180_000) + 10_000
);
const ASK_TIMEOUT_S = 45;
const ASK_CLIENT_MS = ASK_TIMEOUT_S * 1000 + 60_000 + 30_000;

const PLATFORMS = [
  'chatgpt',
  'grok',
  'grok-x',
  'copilot',
  'claude',
  'qwen',
  'deepseek',
  'perplexity',
  'kimi',
  'zai',
  'minimax'
];

const cases = [];
let n = 0;
function add(c) {
  n += 1;
  const id = String(n).padStart(3, '0');
  cases.push({ id, ...c });
}

add({ tool: 'browsers_list', platform: '*', args: {}, needs: [], destructive: false, timeoutMs: 30000 });
add({
  tool: 'browsers_bind',
  platform: '*',
  args: { browserId: '{{browserId}}' },
  needs: [],
  destructive: false,
  timeoutMs: 30000
});
add({ tool: 'browsers_status', platform: '*', args: {}, needs: [], destructive: false, timeoutMs: 30000 });

add({
  tool: '__trap_T5_schema_testOnly',
  platform: '*',
  args: {},
  needs: [],
  destructive: false,
  timeoutMs: 30000,
  note: 'listTools jobs_enqueue.testOnly must describe [ce-test] filter, not dry-run'
});
add({
  tool: '__trap_T1_empty_platforms',
  platform: '*',
  args: {},
  needs: [],
  destructive: false,
  timeoutMs: 60000,
  note: 'bind online empty platformsEnabled browser → PLATFORM_DISABLED'
});
add({
  tool: '__trap_T2_testOnly_default',
  platform: 'perplexity',
  args: {},
  needs: [],
  destructive: false,
  timeoutMs: 120000,
  note: 'delete_batch default testOnly on non-[ce-test] → DESTRUCTIVE_DISABLED or paywall RED'
});

add({
  tool: '__skip_janitorai',
  platform: 'janitorai',
  args: {},
  needs: [],
  destructive: false,
  timeoutMs: 1000,
  expect: 'SKIP(wire-filtered)'
});

for (const platform of PLATFORMS) {
  const title = `[ce-test] runlist ${platform} {{ts}}`;
  const needle = `runlistNeedle{{ts}}`;

  add({ tool: 'platforms_list', platform, args: {}, needs: [], destructive: false, timeoutMs: 30000 });
  add({
    tool: 'tabs_ensure',
    platform,
    args: { platform },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'platforms_status',
    platform,
    args: { platform, ensureTab: false },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'platforms_capabilities',
    platform,
    args: { platform },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chats_list',
    platform,
    args: { platform, limit: 10 },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chats_create',
    platform,
    args: { platform, title, text: `${title}\n${needle}`, ensureTab: true },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    slot: 'chatId'
  });
  add({
    tool: 'chats_send',
    platform,
    args: { platform, chatId: '{{chatId}}', text: `[ce-test] ping ${needle}`, ensureTab: true },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: Math.max(RPC_FLOOR_MS, 250_000)
  });
  add({
    tool: 'chat_ask',
    platform,
    args: {
      platform,
      chatId: '{{chatId}}',
      prompt: `[ce-test] reply ok ${needle}`,
      timeout_s: ASK_TIMEOUT_S,
      ensureTab: true,
      onCaptcha: 'stop'
    },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: Math.max(RPC_FLOOR_MS, ASK_CLIENT_MS)
  });
  add({
    tool: 'chats_get',
    platform,
    args: { platform, chatId: '{{chatId}}' },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chat_outline',
    platform,
    args: { platform, chatId: '{{chatId}}' },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chat_read',
    platform,
    args: { platform, chatId: '{{chatId}}', startTurn: 0, endTurn: 3, maxChars: 4000 },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chats_export',
    platform,
    args: { platform, chatId: '{{chatId}}', formats: ['md'] },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chat_cache_sync',
    platform,
    args: { platform, chatId: '{{chatId}}' },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    slot: 'cacheId'
  });
  add({
    tool: 'chat_cache_read',
    platform,
    args: { cacheId: '{{cacheId}}', query: needle, maxChars: 4000 },
    needs: ['cacheId'],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'chat_cache_append',
    platform,
    args: { cacheId: '{{cacheId}}', turns: [{ role: 'user', text: `append-${needle}` }] },
    needs: ['cacheId'],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'chat_cache_update_block',
    platform,
    args: { cacheId: '{{cacheId}}', turnIndex: 0, content: `updated-${needle}`, role: 'user' },
    needs: ['cacheId'],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'chats_search',
    platform,
    args: { query: needle, platform, limit: 20 },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'tabs_search',
    platform,
    args: { query: platform, platform, limit: 20 },
    needs: [],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'jobs_enqueue',
    platform,
    args: { kind: 'library_ingest', platform, chatIds: ['{{chatId}}'] },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: 30000,
    waitJob: true,
    assertBatch: true
  });
  add({
    tool: 'jobs_status',
    platform,
    args: { job_id: '{{lastJobId}}' },
    needs: ['lastJobId'],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'jobs_list',
    platform,
    args: { limit: 5 },
    needs: [],
    destructive: false,
    timeoutMs: 30000
  });
  add({
    tool: 'jobs_enqueue',
    platform,
    args: { kind: 'export', platform, chatId: '{{chatId}}', formats: ['md'] },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: 30000,
    waitJob: true,
    assertBatch: false
  });
  add({
    tool: 'jobs_enqueue',
    platform,
    args: { kind: 'export_batch', platform, chatIds: ['{{chatId}}'], formats: ['md'] },
    needs: ['chatId'],
    destructive: false,
    timeoutMs: 30000,
    waitJob: true,
    assertBatch: true
  });
  add({
    tool: 'projects_list',
    platform,
    args: { platform, limit: 10 },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    softFail: 'unsupported'
  });
  add({
    tool: 'projects_create',
    platform,
    args: { platform, name: `[ce-test] runlist-proj ${platform} {{ts}}` },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    softFail: 'unsupported',
    slot: 'containerId'
  });
  add({
    tool: 'projects_chats',
    platform,
    args: { platform, containerId: '{{containerId}}', limit: 5 },
    needs: ['containerId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    softFail: 'unsupported'
  });
  add({
    tool: 'projects_move_chat',
    platform,
    args: { platform, chatId: '{{chatId}}', containerId: '{{containerId}}' },
    needs: ['chatId', 'containerId'],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    softFail: 'unsupported'
  });
  add({
    tool: 'projects_delete',
    platform,
    args: { platform, containerId: '{{containerId}}', confirm: true },
    needs: ['containerId'],
    destructive: true,
    timeoutMs: RPC_FLOOR_MS,
    softFail: 'unsupported'
  });
  add({
    tool: 'chats_create',
    platform,
    args: {
      platform,
      title: `[ce-test] runlist2 ${platform} {{ts}}`,
      text: `[ce-test] runlist2 ${platform} {{ts}}`,
      ensureTab: true
    },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    slot: 'chatId2'
  });
  add({
    tool: 'jobs_enqueue',
    platform,
    args: { kind: 'delete', platform, chatId: '{{chatId2}}', confirm: true },
    needs: ['chatId2'],
    destructive: true,
    timeoutMs: 30000,
    waitJob: true,
    assertBatch: false
  });
  add({
    tool: 'chats_delete',
    platform,
    args: { platform, chatId: '{{chatId}}', confirm: true },
    needs: ['chatId'],
    destructive: true,
    timeoutMs: RPC_FLOOR_MS
  });
  add({
    tool: 'chats_create',
    platform,
    args: {
      platform,
      title: `[ce-test] runlist3 ${platform} {{ts}}`,
      text: `[ce-test] runlist3 ${platform} {{ts}}`,
      ensureTab: true
    },
    needs: [],
    destructive: false,
    timeoutMs: RPC_FLOOR_MS,
    slot: 'chatId3'
  });
  add({
    tool: 'jobs_enqueue',
    platform,
    args: { kind: 'delete_batch', platform, chatIds: ['{{chatId3}}'], confirm: true },
    needs: ['chatId3'],
    destructive: true,
    timeoutMs: 30000,
    waitJob: true,
    assertBatch: true
  });
  add({
    tool: 'chat_cache_delete',
    platform,
    args: { cacheId: '{{cacheId}}' },
    needs: ['cacheId'],
    destructive: false,
    timeoutMs: 30000,
    softFail: 'missing-slot'
  });
}

add({
  tool: 'jobs_enqueue',
  platform: 'perplexity',
  args: { kind: 'export_batch', platform: 'perplexity', query: 'zzz-runlist-cancel', max: 1, formats: ['md'] },
  needs: [],
  destructive: false,
  timeoutMs: 30000,
  slot: 'cancelJobId',
  waitJob: false
});
add({
  tool: 'jobs_cancel',
  platform: 'perplexity',
  args: { job_id: '{{cancelJobId}}' },
  needs: ['cancelJobId'],
  destructive: false,
  timeoutMs: 30000
});

const doc = {
  version: 1,
  generatedAt: new Date().toISOString(),
  rpcFloorMs: RPC_FLOOR_MS,
  platforms: PLATFORMS,
  caseCount: cases.length,
  cases
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${OUT} cases=${cases.length} rpcFloorMs=${RPC_FLOOR_MS}`);
