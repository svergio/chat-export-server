type ChatMessage = Record<string, any>;
type ChatPayload = { chatId?: string; platform?: string; title?: string; messages?: ChatMessage[] } | null | undefined;

export interface OutlineTurn {
  i: number;
  role: string;
  chars: number;
  preview: string;
  thinkingChars?: number;
}

export interface ReadTurn {
  i: number;
  role: string;
  text: string;
  chars: number;
  truncated?: boolean;
  thinkingChars?: number;
}

const PREVIEW_DEFAULT = 120;
const READ_MAX_CHARS_DEFAULT = 4000;
const READ_MAX_TURNS = 10;

export function buildChatOutline(payload: ChatPayload, opts: { previewChars?: number } = {}) {
  const previewChars = clampInt(opts.previewChars, 40, 300, PREVIEW_DEFAULT);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const turns = messages.map((m, i): OutlineTurn => {
    const text = String(m?.text || '');
    const thinkingChars =
      typeof m?.thinkingChars === 'number'
        ? m.thinkingChars
        : typeof m?.thinking === 'string'
          ? m.thinking.length
          : 0;
    const row: OutlineTurn = {
      i,
      role: m?.role || 'assistant',
      chars: text.length,
      preview: truncate(text, previewChars)
    };
    if (thinkingChars > 0) row.thinkingChars = thinkingChars;
    return row;
  });
  return {
    chatId: payload?.chatId || '',
    platform: payload?.platform || '',
    title: payload?.title || '',
    total: turns.length,
    turns
  };
}

export function buildChatRead(payload: ChatPayload, opts: { start?: number; end?: number; maxChars?: number } = {}) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const total = messages.length;
  let start = resolveIndex(opts.start, total, 0);
  if (total === 0) start = 0;
  let end =
    opts.end !== undefined
      ? resolveIndex(opts.end, total, start + READ_MAX_TURNS - 1)
      : start + READ_MAX_TURNS - 1;
  if (!Number.isFinite(end)) end = start + READ_MAX_TURNS - 1;
  end = Math.min(Math.max(end, start), Math.max(0, total - 1));
  if (total === 0) {
    return {
      chatId: payload?.chatId || '',
      platform: payload?.platform || '',
      start: 0,
      end: -1,
      total: 0,
      next: null,
      turns: []
    };
  }
  if (end - start + 1 > READ_MAX_TURNS) {
    end = start + READ_MAX_TURNS - 1;
  }
  const maxChars = clampInt(opts.maxChars, 200, 20000, READ_MAX_CHARS_DEFAULT);
  const turns: ReadTurn[] = [];
  for (let i = start; i <= end; i++) {
    const m = messages[i];
    const full = String(m?.text || '');
    const truncated = full.length > maxChars;
    const text = truncated ? full.slice(0, maxChars) : full;
    const thinkingChars =
      typeof m?.thinkingChars === 'number'
        ? m.thinkingChars
        : typeof m?.thinking === 'string'
          ? m.thinking.length
          : 0;
    const row: ReadTurn = {
      i,
      role: m?.role || 'assistant',
      text,
      chars: full.length
    };
    if (truncated) row.truncated = true;
    if (thinkingChars > 0) row.thinkingChars = thinkingChars;
    turns.push(row);
  }
  const next = end + 1 < total ? end + 1 : null;
  return {
    chatId: payload?.chatId || '',
    platform: payload?.platform || '',
    start,
    end,
    total,
    next,
    turns
  };
}

// Last assistant turn for chat_ask done response.
export function lastAssistantReply(payload: ChatPayload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'assistant') {
      const text = String(m.text || '');
      const thinkingChars =
        typeof m.thinkingChars === 'number'
          ? m.thinkingChars
          : typeof m.thinking === 'string'
            ? m.thinking.length
            : 0;
      const reply: { i: number; role: string; text: string; thinkingChars?: number } = { i, role: 'assistant', text };
      if (thinkingChars > 0) reply.thinkingChars = thinkingChars;
      return { reply, after: i, total: messages.length };
    }
  }
  return { reply: null, after: -1, total: messages.length };
}

export function isPlaceholderReply(text: unknown): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  // Streaming / status stubs only — short final answers (e.g. SEND_OK) are valid.
  if (
    /^(thinking|размышление)[.…]{0,3}$/i.test(t) ||
    (/выполняется|searching the web|поиск в интернете|thinking[.…]|размышление:/i.test(t) && t.length < 400)
  ) {
    return true;
  }
  return false;
}

function truncate(text: unknown, n: number): string {
  const s = String(text || '');
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + '…';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Negative indexes count from the end (Python-style). */
function resolveIndex(value: unknown, total: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let idx = Math.trunc(n);
  if (idx < 0) idx = total + idx;
  if (total <= 0) return 0;
  return Math.min(Math.max(idx, 0), total - 1);
}
