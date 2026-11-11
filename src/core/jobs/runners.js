import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { lastAssistantReply, isPlaceholderReply } from '../chat-views.js';
import { isRetryable } from './lanes.js';

export const TEST_PREFIX = '[ce-test]';
const DEFAULT_POLL_MS = 800;
const BATCH_MAX = 500;
const LIST_PAGE = 100;
const CHAT_OPTION_KEYS = ['model', 'mode', 'toggles', 'tools', 'files'];

/**
 * @param {import('../server-core.js').ServerCore} core
 * @param {object} job
 * @param {object} ctx lane context (checkCancel, setStatus, progress, saveState, sleep)
 * @param {{ pollMs?: number }} [opts]
 */
export function runJob(core, job, ctx, opts = {}) {
  switch (job.kind) {
    case 'ask':
      return runAsk(core, job, ctx, opts);
    case 'export':
      return runExport(core, job);
    case 'export_batch':
      return runExportBatch(core, job, ctx);
    case 'delete':
      return runDelete(core, job, ctx);
    case 'delete_batch':
      return runDeleteBatch(core, job, ctx);
    default:
      throw new ProtocolError(ERROR_CODES.INVALID_ARGS, 'unknown job kind: ' + job.kind);
  }
}

function pickChatOptions(input) {
  const out = {};
  for (const k of CHAT_OPTION_KEYS) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

async function hostState(core, platform, chatId, cache) {
  if (cache.unsupported) return null;
  try {
    return await core.callOp('platform.host_state', platform, chatId ? { chatId } : {});
  } catch (err) {
    if (isRetryable(err)) throw err;
    // Older extensions do not implement host_state: fall back to chats.get polling only.
    cache.unsupported = true;
    return null;
  }
}

function assertNotBusy(state, platform) {
  if (!state?.busy) return;
  throw new ProtocolError(ERROR_CODES.PLATFORM_BUSY, state.banner || platform + ' is busy', {
    retryable: true,
    banner: state.banner || null
  });
}

async function runAsk(core, job, ctx, opts) {
  const { input, platform } = job;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const cache = {};
  let state = job.state || {};
  if (!state.startedAt) {
    state = { ...state, startedAt: Date.now() };
    ctx.saveState({ startedAt: state.startedAt });
  }

  if (!state.sent) {
    assertNotBusy(await hostState(core, platform, input.chatId, cache), platform);
    ctx.checkCancel();
    ctx.progress({ current: 'sending' });
    let chatId;
    let minAfter = -1;
    let baselineLen = 0;
    if (!input.chatId) {
      const created = await core.chatsCreate(platform, {
        text: input.prompt,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...pickChatOptions(input)
      });
      chatId = created.chatId;
    } else {
      chatId = await core.resolveChatId(platform, input.chatId);
      for (let attempt = 0; attempt < 5; attempt++) {
        ctx.checkCancel();
        try {
          const payload = await core.chatsGet(platform, { chatId });
          const msgs = Array.isArray(payload?.messages) ? payload.messages : [];
          baselineLen = msgs.length;
          const lar = lastAssistantReply(payload);
          minAfter = lar.reply ? lar.after : -1;
          if (baselineLen > 0 || lar.reply) break;
        } catch {
          minAfter = -1;
        }
        await ctx.sleep(Math.min(pollMs, 400));
      }
      ctx.checkCancel();
      await core.chatsSend(platform, { chatId, text: input.prompt, ...pickChatOptions(input) });
    }
    state = { ...state, sent: true, chatId, minAfter, baselineLen };
    ctx.saveState({ sent: true, chatId, minAfter, baselineLen });
  }

  ctx.setStatus('waiting_host');
  ctx.progress({ current: 'waiting_reply' });
  const { chatId, minAfter = -1, baselineLen = 0 } = state;
  const deadline = state.startedAt + input.timeout_s * 1000;
  let lastAfter = minAfter;
  do {
    ctx.checkCancel();
    const host = await hostState(core, platform, chatId, cache);
    assertNotBusy(host, platform);
    if (!host?.generating) {
      try {
        const { reply, after, total } = lastAssistantReply(await core.chatsGet(platform, { chatId }));
        lastAfter = after;
        const grew = baselineLen <= 0 || total > baselineLen;
        if (reply?.text && after > minAfter && grew && !isPlaceholderReply(reply.text)) {
          return { chatId, platform, status: 'done', reply, after, total };
        }
      } catch (err) {
        if (isRetryable(err) || err?.code === ERROR_CODES.NOT_BOUND) throw err;
      }
    }
    await ctx.sleep(pollMs);
  } while (Date.now() < deadline);
  throw new ProtocolError(ERROR_CODES.TIMEOUT, 'no reply within ' + input.timeout_s + 's', {
    chatId,
    platform,
    after: lastAfter,
    hint: 'call chat_read with start=after+1'
  });
}

function exportArgs(input, chatId) {
  const args = { chatId, formats: input.formats };
  if (input.outDir !== undefined) args.outDir = input.outDir;
  if (input.branch !== undefined) args.branch = input.branch;
  return args;
}

function runExport(core, job) {
  return core.chatsExport(job.platform, exportArgs(job.input, job.input.chatId));
}

async function collectItems(core, platform, input) {
  if (Array.isArray(input.chatIds) && input.chatIds.length) {
    return [...new Set(input.chatIds)].slice(0, BATCH_MAX).map((chatId) => ({ chatId }));
  }
  const max = Math.min(BATCH_MAX, Math.max(1, Number(input.max) || LIST_PAGE));
  const items = [];
  const seen = new Set();
  let cursor = null;
  do {
    const args = { limit: LIST_PAGE, query: input.query };
    if (input.includeProjectChats === false) args.includeProjectChats = false;
    if (cursor) args.cursor = cursor;
    const page = await core.chatsList(platform, args);
    for (const it of page?.items || []) {
      if (!it?.chatId || seen.has(it.chatId)) continue;
      seen.add(it.chatId);
      items.push({ chatId: it.chatId, title: it.title || '' });
      if (items.length >= max) break;
    }
    const next = page?.nextCursor || null;
    cursor = next && next !== cursor ? next : null;
  } while (cursor && items.length < max);
  return items;
}

function itemError(err) {
  return { code: err?.code || ERROR_CODES.HOST_ERROR, message: err?.message || String(err) };
}

/** Errors that should fail/retry the whole job instead of being recorded per item. */
function isJobLevelError(err) {
  return (
    isRetryable(err) ||
    [
      ERROR_CODES.NOT_BOUND,
      ERROR_CODES.CONFIRM_REQUIRED,
      ERROR_CODES.DESTRUCTIVE_DISABLED,
      ERROR_CODES.PLATFORM_DISABLED
    ].includes(err?.code)
  );
}

async function runBatch(core, job, ctx, eachItem) {
  let items = job.state?.items;
  if (!items) {
    ctx.progress({ current: 'listing' });
    items = await collectItems(core, job.platform, job.input);
    ctx.saveState({ items, results: [] });
  }
  const results = [...(job.state?.results || [])];
  ctx.progress({ total: items.length, done: results.length });
  for (let i = results.length; i < items.length; i++) {
    ctx.checkCancel();
    const item = items[i];
    ctx.progress({ current: item.chatId });
    let row;
    try {
      row = { chatId: item.chatId, ok: true, ...(await eachItem(item)) };
    } catch (err) {
      if (isJobLevelError(err) && !err?.details?.itemOnly) throw err;
      row = { chatId: item.chatId, ok: false, error: itemError(err) };
    }
    results.push(row);
    ctx.saveState({ results });
    ctx.progress({ done: results.length });
  }
  ctx.progress({ current: null });
  const ok = results.filter((r) => r.ok).length;
  return { total: items.length, ok, failed: results.length - ok, items: results };
}

function runExportBatch(core, job, ctx) {
  return runBatch(core, job, ctx, async (item) => {
    const r = await core.chatsExport(job.platform, exportArgs(job.input, item.chatId));
    return { dir: r.dir, paths: r.paths, title: r.title, turns: r.turns };
  });
}

async function assertTestChat(core, platform, chatId, knownTitle) {
  let title = knownTitle;
  if (title === undefined) {
    const payload = await core.chatsGet(platform, { chatId });
    title = payload?.title || '';
  }
  if (String(title).trim().startsWith(TEST_PREFIX)) return title;
  core.audit({
    action: 'chats.delete',
    platform,
    args: { chatId },
    ok: false,
    code: ERROR_CODES.DESTRUCTIVE_DISABLED,
    reason: 'test_only'
  });
  throw new ProtocolError(
    ERROR_CODES.DESTRUCTIVE_DISABLED,
    'testOnly: chat title does not start with ' + TEST_PREFIX,
    { chatId, title, itemOnly: true, hint: 'pass testOnly:false to delete non-test chats' }
  );
}

async function deleteOne(core, job, chatId, knownTitle) {
  const { platform, input } = job;
  if (input.testOnly !== false) await assertTestChat(core, platform, chatId, knownTitle);
  return core.chatsDelete(platform, { chatId }, { confirm: input.confirm === true });
}

async function runDelete(core, job, ctx) {
  ctx.checkCancel();
  return deleteOne(core, job, job.input.chatId);
}

function runDeleteBatch(core, job, ctx) {
  return runBatch(core, job, ctx, async (item) => {
    const r = await deleteOne(core, job, item.chatId, item.title);
    return { deleted: Boolean(r?.deleted) };
  });
}
