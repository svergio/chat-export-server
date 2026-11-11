import crypto from 'node:crypto';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { buildChatOutline, buildChatRead } from './chat-views.js';
import type { ServerCore } from './server-core.js';
import type { DatabaseAdapter, Row } from '../types.js';

const AUTO_CACHE_MIN_MESSAGES = 12;
const AUTO_CACHE_MIN_CHARS = 16000;
const READ_MAX_CHARS_DEFAULT = 12000;

interface ChatRef {
  cacheId?: string;
  platform?: string;
  chatId?: string;
}

interface SyncArgs {
  platform?: string;
  chatId?: string;
  browserId?: string;
  branch?: string;
  force?: boolean;
  containerId?: string;
}

interface ReadArgs extends ChatRef {
  startTurn?: number;
  endTurn?: number;
  blockId?: string;
  query?: string;
  maxChars?: number;
}

interface AppendArgs extends ChatRef {
  turns?: any[];
}

interface UpdateBlockArgs extends ChatRef {
  turnIndex?: number;
  content?: string;
  role?: string;
  resyncFromHost?: boolean;
}

interface AutoCacheMeta {
  browserId?: string;
  platform?: string;
  chatId?: string;
  containerId?: string;
}

type Payload = Record<string, any>;

export class ChatCacheManager {
  db: DatabaseAdapter;
  core: ServerCore;

  constructor(db: DatabaseAdapter, core: ServerCore) {
    this.db = db;
    this.core = core;
  }

  cacheIdFor(browserId: unknown, platform: unknown, chatId: unknown): string {
    const key = [String(browserId || ''), String(platform || ''), String(chatId || '')].join('\0');
    const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
    return 'cc_' + digest;
  }

  async sync({ platform, chatId, browserId, branch, force = false, containerId }: SyncArgs = {}) {
    const plat = String(platform || '').trim();
    const cid = String(chatId || '').trim();
    if (!plat || !cid) {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'platform and chatId are required');
    }
    const boundBrowserId = this.#resolveBrowserId(browserId);
    const cacheId = this.cacheIdFor(boundBrowserId, plat, cid);

    // Protocol ChatsGetArgs allows only chatId; the extension defaults branch to active when omitted.
    const args: Record<string, unknown> = { chatId: cid };
    const raw = await this.core.chatsGet(plat, args);
    const payload = normalizePayload(raw);
    const stored = this.#persistPayload(cacheId, boundBrowserId, plat, cid, payload, { containerId });
    return { ...stored, browserId: boundBrowserId, branch, refreshed: true, force: Boolean(force) };
  }

  autoCacheIfNeeded(payload: Payload | null | undefined, meta: AutoCacheMeta = {}) {
    if (!payload || !this.#shouldAutoCache(payload)) return null;
    const plat = String(meta.platform || payload.platform || '').trim();
    const cid = String(meta.chatId || payload.chatId || '').trim();
    if (!plat || !cid) return null;
    let browserId: string;
    try {
      browserId = this.#resolveBrowserId(meta.browserId);
    } catch {
      return null;
    }
    const cacheId = this.cacheIdFor(browserId, plat, cid);
    return this.#persistPayload(cacheId, browserId, plat, cid, payload, { containerId: meta.containerId });
  }

  read({
    cacheId,
    platform,
    chatId,
    startTurn,
    endTurn,
    blockId,
    query,
    maxChars = READ_MAX_CHARS_DEFAULT
  }: ReadArgs = {}) {
    const row = this.#resolveChatRow({ cacheId, platform, chatId });
    if (!row) {
      throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'cached chat not found');
    }
    const limit = clampInt(maxChars, 200, 200000, READ_MAX_CHARS_DEFAULT);

    if (query !== undefined && String(query).trim()) {
      return this.#readFts(row.cache_id, String(query).trim(), limit, row);
    }

    let start = startTurn !== undefined ? Number(startTurn) : 0;
    let end: number | undefined = endTurn !== undefined ? Number(endTurn) : undefined;
    if (blockId) {
      const m = /^b-(\d+)$/.exec(String(blockId).trim());
      if (!m) {
        throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'blockId must look like b-<turn_index>');
      }
      const idx = Number(m[1]);
      start = idx;
      end = idx;
    }
    if (!Number.isFinite(start)) start = 0;
    if (end !== undefined && !Number.isFinite(end)) end = start;

    const blocks = this.db.all(
      `SELECT turn_index, block_id, role, content, raw_json, revision, updated_at
         FROM cached_chat_blocks
        WHERE cache_id = ?
          AND turn_index >= ?
          ${end !== undefined ? 'AND turn_index <= ?' : ''}
        ORDER BY turn_index ASC`,
      end !== undefined ? [row.cache_id, Math.trunc(start), Math.trunc(end)] : [row.cache_id, Math.trunc(start)]
    );

    const { blocks: sliced, totalChars, truncated } = sliceBlocksToCharLimit(blocks, limit);
    return {
      cacheId: row.cache_id,
      platform: row.platform,
      chatId: row.chat_id,
      title: row.title,
      startTurn: sliced[0]?.turn_index ?? null,
      endTurn: sliced[sliced.length - 1]?.turn_index ?? null,
      totalTurns: row.total_turns,
      blocks: sliced.map(formatBlock),
      totalChars,
      truncated
    };
  }

  append({ cacheId, platform, chatId, turns }: AppendArgs) {
    const row = this.#resolveChatRow({ cacheId, platform, chatId });
    if (!row) {
      throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'cached chat not found');
    }
    const list = Array.isArray(turns) ? turns : [];
    if (!list.length) {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'turns array is required');
    }

    const now = new Date().toISOString();
    let addedChars = 0;
    const inserted = this.db.transaction((db) => {
      const maxRow = db.get('SELECT MAX(turn_index) AS mx FROM cached_chat_blocks WHERE cache_id = ?', [row.cache_id]);
      let next = Number(maxRow?.mx);
      if (!Number.isFinite(next)) next = -1;
      const out: Array<{ turnIndex: number; blockId: string; role: string; revision: number }> = [];
      for (const turn of list) {
        next += 1;
        const content = String(turn?.text ?? turn?.content ?? '');
        const role = String(turn?.role || 'assistant');
        const blockId = 'b-' + next;
        const rawJson = JSON.stringify(turn ?? {});
        db.run(
          `INSERT INTO cached_chat_blocks (cache_id, turn_index, block_id, role, content, raw_json, revision, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [row.cache_id, next, blockId, role, content, rawJson, now]
        );
        db.run('INSERT INTO cached_chat_fts (cache_id, turn_index, role, content) VALUES (?, ?, ?, ?)', [
          row.cache_id,
          next,
          role,
          content
        ]);
        addedChars += content.length;
        out.push({ turnIndex: next, blockId, role, revision: 1 });
      }
      const totalTurns = next + 1;
      db.run(
        'UPDATE cached_chats SET total_turns = ?, total_chars = total_chars + ?, updated_at = ? WHERE cache_id = ?',
        [totalTurns, addedChars, now, row.cache_id]
      );
      return out;
    });

    const fresh = this.db.get('SELECT total_turns, total_chars FROM cached_chats WHERE cache_id = ?', [row.cache_id]);
    return {
      cacheId: row.cache_id,
      appended: inserted,
      totalTurns: fresh?.total_turns ?? row.total_turns + list.length,
      totalChars: fresh?.total_chars,
      addedChars
    };
  }

  async updateBlock({
    cacheId,
    platform,
    chatId,
    turnIndex,
    content,
    role,
    resyncFromHost = false
  }: UpdateBlockArgs = {}) {
    const row = this.#resolveChatRow({ cacheId, platform, chatId });
    if (!row) {
      throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'cached chat not found');
    }
    const ti = Number(turnIndex);
    if (!Number.isFinite(ti) || ti < 0) {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'turnIndex is required');
    }

    const block = this.db.get(
      'SELECT turn_index, block_id, role, content, revision FROM cached_chat_blocks WHERE cache_id = ? AND turn_index = ?',
      [row.cache_id, Math.trunc(ti)]
    );
    if (!block) {
      throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'cache block not found at turnIndex ' + ti);
    }

    let nextContent = content !== undefined ? String(content) : block.content;
    let nextRole = role !== undefined ? String(role) : block.role;
    let rawJson: string | null = null;

    if (resyncFromHost) {
      const raw = await this.core.chatsGet(row.platform, { chatId: row.chat_id });
      const payload = normalizePayload(raw);
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const msg = messages[ti];
      if (!msg) {
        throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'host chat has no message at turnIndex ' + ti);
      }
      nextContent = String(msg.text || '');
      nextRole = String(msg.role || nextRole);
      rawJson = JSON.stringify(msg);
    }

    const now = new Date().toISOString();
    const nextRevision = Number(block.revision || 1) + 1;
    const oldLen = String(block.content || '').length;
    const delta = nextContent.length - oldLen;

    this.db.transaction((db) => {
      db.run(
        `UPDATE cached_chat_blocks
            SET role = ?, content = ?, raw_json = COALESCE(?, raw_json), revision = ?, updated_at = ?
          WHERE cache_id = ? AND turn_index = ?`,
        [nextRole, nextContent, rawJson, nextRevision, now, row.cache_id, Math.trunc(ti)]
      );
      db.run('DELETE FROM cached_chat_fts WHERE cache_id = ? AND turn_index = ?', [row.cache_id, Math.trunc(ti)]);
      db.run('INSERT INTO cached_chat_fts (cache_id, turn_index, role, content) VALUES (?, ?, ?, ?)', [
        row.cache_id,
        Math.trunc(ti),
        nextRole,
        nextContent
      ]);
      if (delta !== 0) {
        db.run('UPDATE cached_chats SET total_chars = total_chars + ?, updated_at = ? WHERE cache_id = ?', [
          delta,
          now,
          row.cache_id
        ]);
      } else {
        db.run('UPDATE cached_chats SET updated_at = ? WHERE cache_id = ?', [now, row.cache_id]);
      }
    });

    return {
      cacheId: row.cache_id,
      turnIndex: Math.trunc(ti),
      blockId: block.block_id,
      role: nextRole,
      revision: nextRevision,
      resyncFromHost: Boolean(resyncFromHost),
      chars: nextContent.length
    };
  }

  remove({ cacheId, platform, chatId }: ChatRef = {}) {
    const row = this.#resolveChatRow({ cacheId, platform, chatId });
    if (!row) {
      throw new ProtocolError(ERROR_CODES.NOT_FOUND, 'cached chat not found');
    }
    this.db.transaction((db) => {
      db.run('DELETE FROM cached_chat_fts WHERE cache_id = ?', [row.cache_id]);
      db.run('DELETE FROM cached_chat_blocks WHERE cache_id = ?', [row.cache_id]);
      db.run('DELETE FROM cached_chats WHERE cache_id = ?', [row.cache_id]);
    });
    return { cacheId: row.cache_id, platform: row.platform, chatId: row.chat_id, removed: true };
  }

  #rpcGetArgs(args: Record<string, any> = {}) {
    const out: Record<string, any> = {};
    if (args.chatId !== undefined) out.chatId = args.chatId;
    if (args.branch !== undefined) out.branch = args.branch;
    return out;
  }

  async chatOutline(platform: string, args: Record<string, any> = {}) {
    const raw = await this.core.chatsGet(platform, this.#rpcGetArgs(args));
    const payload = normalizePayload(raw);
    const auto = this.autoCacheIfNeeded(payload, {
      platform,
      chatId: args.chatId || payload.chatId,
      browserId: args.browserId
    });
    const outline: ReturnType<typeof buildChatOutline> & { cache?: Record<string, unknown> } = buildChatOutline(
      payload,
      args
    );
    if (auto) outline.cache = { cacheId: auto.cacheId, autoCached: true, totalTurns: auto.totalTurns };
    return outline;
  }

  async chatRead(platform: string, args: Record<string, any> = {}) {
    const raw = await this.core.chatsGet(platform, this.#rpcGetArgs(args));
    const payload = normalizePayload(raw);
    const auto = this.autoCacheIfNeeded(payload, {
      platform,
      chatId: args.chatId || payload.chatId,
      browserId: args.browserId
    });
    const read: ReturnType<typeof buildChatRead> & { cache?: Record<string, unknown> } = buildChatRead(payload, args);
    if (auto) read.cache = { cacheId: auto.cacheId, autoCached: true, totalTurns: auto.totalTurns };
    return read;
  }

  #persistPayload(
    cacheId: string,
    browserId: string,
    platform: string,
    chatId: string,
    payload: Payload,
    { containerId }: { containerId?: string } = {}
  ) {
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const now = new Date().toISOString();
    let totalChars = 0;
    const meta = {
      url: payload?.url || '',
      userName: payload?.userName || '',
      userHandle: payload?.userHandle || '',
      userEmail: payload?.userEmail || ''
    };

    this.db.transaction((db) => {
      db.run('DELETE FROM cached_chat_fts WHERE cache_id = ?', [cacheId]);
      db.run('DELETE FROM cached_chat_blocks WHERE cache_id = ?', [cacheId]);
      const existing = db.get('SELECT cache_id, created_at FROM cached_chats WHERE cache_id = ?', [cacheId]);
      const createdAt = existing?.created_at || now;
      db.run(
        `INSERT INTO cached_chats (
           cache_id, browser_id, platform, chat_id, container_id, title, model,
           total_turns, total_chars, meta_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_id) DO UPDATE SET
           browser_id = excluded.browser_id,
           platform = excluded.platform,
           chat_id = excluded.chat_id,
           container_id = COALESCE(excluded.container_id, cached_chats.container_id),
           title = excluded.title,
           model = excluded.model,
           total_turns = excluded.total_turns,
           total_chars = excluded.total_chars,
           meta_json = excluded.meta_json,
           updated_at = excluded.updated_at`,
        [
          cacheId,
          browserId,
          platform,
          chatId,
          containerId || null,
          String(payload?.title || ''),
          String(payload?.model || ''),
          messages.length,
          0,
          JSON.stringify(meta),
          createdAt,
          now
        ]
      );

      messages.forEach((m: any, turnIndex: number) => {
        const content = String(m?.text || '');
        totalChars += content.length;
        const role = String(m?.role || 'assistant');
        const blockId = 'b-' + turnIndex;
        const rawJson = JSON.stringify(m ?? {});
        db.run(
          `INSERT INTO cached_chat_blocks (cache_id, turn_index, block_id, role, content, raw_json, revision, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [cacheId, turnIndex, blockId, role, content, rawJson, now]
        );
        db.run('INSERT INTO cached_chat_fts (cache_id, turn_index, role, content) VALUES (?, ?, ?, ?)', [
          cacheId,
          turnIndex,
          role,
          content
        ]);
      });

      db.run('UPDATE cached_chats SET total_chars = ?, total_turns = ?, updated_at = ? WHERE cache_id = ?', [
        totalChars,
        messages.length,
        now,
        cacheId
      ]);
    });

    return {
      cacheId,
      platform,
      chatId,
      title: String(payload?.title || ''),
      model: String(payload?.model || ''),
      totalTurns: messages.length,
      totalChars,
      updatedAt: now
    };
  }

  #readFts(cacheId: string, query: string, maxChars: number, row: Row) {
    const match = buildFtsMatch(query);
    const hits = this.db.all(
      `SELECT b.turn_index, b.block_id, b.role, b.content, b.revision, b.updated_at,
              snippet(cached_chat_fts, 3, '[', ']', '...', 24) AS snippet
         FROM cached_chat_fts
         JOIN cached_chat_blocks b
           ON b.cache_id = cached_chat_fts.cache_id
          AND b.turn_index = cached_chat_fts.turn_index
        WHERE cached_chat_fts MATCH ?
          AND cached_chat_fts.cache_id = ?
        ORDER BY b.turn_index ASC
        LIMIT 80`,
      [match, cacheId]
    );
    const { blocks: sliced, totalChars, truncated } = sliceBlocksToCharLimit(
      hits.map((h) => ({ ...h, snippet: h.snippet })),
      maxChars
    );
    return {
      cacheId,
      platform: row.platform,
      chatId: row.chat_id,
      title: row.title,
      query,
      blocks: sliced.map((b) => ({
        ...formatBlock(b),
        snippet: b.snippet || undefined
      })),
      totalChars,
      truncated,
      matchCount: hits.length
    };
  }

  #resolveChatRow({ cacheId, platform, chatId }: ChatRef): Row | null {
    if (cacheId) {
      return this.db.get(
        'SELECT cache_id, browser_id, platform, chat_id, title, total_turns, total_chars, updated_at FROM cached_chats WHERE cache_id = ?',
        [String(cacheId)]
      );
    }
    const plat = String(platform || '').trim();
    const cid = String(chatId || '').trim();
    if (!plat || !cid) {
      throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'cacheId or platform+chatId required');
    }
    const rows = this.db.all(
      'SELECT cache_id, browser_id, platform, chat_id, title, total_turns, total_chars, updated_at FROM cached_chats WHERE platform = ? AND chat_id = ? ORDER BY updated_at DESC',
      [plat, cid]
    );
    return rows[0] || null;
  }

  #resolveBrowserId(browserId: unknown): string {
    const explicit = String(browserId || '').trim();
    if (explicit) return explicit;
    const browser = this.core.hub?.getBound?.();
    if (!browser?.browserId) {
      throw new ProtocolError(ERROR_CODES.NOT_BOUND, 'no browser bound; pass browserId or bind a browser');
    }
    return browser.browserId;
  }

  #shouldAutoCache(payload: Payload): boolean {
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    if (messages.length >= AUTO_CACHE_MIN_MESSAGES) return true;
    let total = 0;
    for (const m of messages) {
      total += String(m?.text || '').length;
      if (total >= AUTO_CACHE_MIN_CHARS) return true;
    }
    return false;
  }
}

function normalizePayload(data: any): Payload {
  if (!data || typeof data !== 'object') return {};
  if (data.payload && typeof data.payload === 'object') return data.payload;
  return data;
}

function formatBlock(row: Row) {
  return {
    turnIndex: row.turn_index,
    blockId: row.block_id,
    role: row.role,
    content: row.content,
    revision: row.revision,
    updatedAt: row.updated_at,
    chars: String(row.content || '').length
  };
}

function sliceBlocksToCharLimit(blocks: Row[], maxChars: number) {
  let totalChars = 0;
  let truncated = false;
  const out: Row[] = [];
  for (const row of blocks) {
    const content = String(row.content || '');
    const snippet = row.snippet;
    const pieceLen = content.length;
    if (totalChars + pieceLen > maxChars) {
      const room = maxChars - totalChars;
      if (room <= 0) {
        truncated = true;
        break;
      }
      out.push({
        ...row,
        content: content.slice(0, room),
        truncated: true,
        snippet
      });
      totalChars += room;
      truncated = true;
      break;
    }
    out.push({ ...row, snippet });
    totalChars += pieceLen;
  }
  return { blocks: out, totalChars, truncated };
}

function buildFtsMatch(query: unknown): string {
  const tokens = String(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["*]/g, ' ').trim())
    .filter(Boolean);
  if (!tokens.length) return '""';
  if (tokens.length === 1) return '"' + tokens[0].replace(/"/g, '""') + '"';
  return tokens.map((t) => '"' + t.replace(/"/g, '""') + '"').join(' AND ');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
