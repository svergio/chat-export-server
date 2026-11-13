import type { DatabaseAdapter } from '../types.js';

export type TabSnap = {
  tabId: number;
  platform: string | null;
  url: string;
  chatId: string;
  title: string;
  browserId: string;
  seenAt: string;
};

function likeEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function replaceTabSnapshots(db: DatabaseAdapter, browserId: string, tabs: unknown[]): number {
  const bid = String(browserId || '').trim();
  if (!bid) return 0;
  const now = new Date().toISOString();
  const list = Array.isArray(tabs) ? tabs : [];
  return db.transaction((tx) => {
    tx.run('DELETE FROM tab_snapshots WHERE browser_id = ?', [bid]);
    let n = 0;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const t = raw as Record<string, unknown>;
      const tabId = Number(t.tabId);
      if (!Number.isFinite(tabId)) continue;
      const platform = t.platform == null || t.platform === '' ? null : String(t.platform);
      const url = String(t.url || '');
      const chatId = String(t.chatId || '');
      const title = String(t.title || '');
      tx.run(
        `INSERT INTO tab_snapshots (browser_id, tab_id, platform, url, chat_id, title, seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [bid, Math.trunc(tabId), platform, url, chatId, title, now]
      );
      n += 1;
    }
    return n;
  });
}

export function clearTabSnapshots(db: DatabaseAdapter, browserId: string): void {
  const bid = String(browserId || '').trim();
  if (!bid) return;
  db.run('DELETE FROM tab_snapshots WHERE browser_id = ?', [bid]);
}

export function searchTabSnapshots(
  db: DatabaseAdapter,
  {
    query,
    platform,
    browserId,
    limit = 40
  }: { query?: string; platform?: string; browserId?: string; limit?: number } = {}
): { query: string | null; hits: TabSnap[]; returned: number } {
  const lim = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 40)));
  const params: Array<string | number> = [];
  const where: string[] = [];
  const q = String(query || '').trim();
  if (q) {
    const pat = '%' + likeEscape(q) + '%';
    where.push('(title LIKE ? ESCAPE \'\\\' OR url LIKE ? ESCAPE \'\\\' OR chat_id LIKE ? ESCAPE \'\\\')');
    params.push(pat, pat, pat);
  }
  if (platform && String(platform).trim()) {
    where.push('platform = ?');
    params.push(String(platform).trim());
  }
  if (browserId && String(browserId).trim()) {
    where.push('browser_id = ?');
    params.push(String(browserId).trim());
  }
  params.push(lim);
  const sql =
    `SELECT browser_id, tab_id, platform, url, chat_id, title, seen_at
       FROM tab_snapshots
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY seen_at DESC, tab_id ASC
      LIMIT ?`;
  const rows = db.all(sql, params);
  const hits: TabSnap[] = rows.map((r) => ({
    browserId: String(r.browser_id),
    tabId: Number(r.tab_id),
    platform: r.platform == null ? null : String(r.platform),
    url: String(r.url || ''),
    chatId: String(r.chat_id || ''),
    title: String(r.title || ''),
    seenAt: String(r.seen_at || '')
  }));
  return { query: q || null, hits, returned: hits.length };
}
