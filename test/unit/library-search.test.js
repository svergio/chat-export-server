import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../dist/core/db/index.js';
import { ChatCacheManager } from '../../dist/core/chat-cache.js';
import { replaceTabSnapshots, searchTabSnapshots } from '../../dist/core/tab-index.js';

function tmpDb() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-lib-'));
  const dbFile = path.join(home, 'data', 'chat-export.db');
  const db = openDatabase(
    { home, paths: { dbFile }, database: { driver: 'sqlite', url: '' } },
    { migrate: true }
  );
  return { home, db };
}

describe('library search + tabs index', () => {
  it('persistAlways indexes short chats and chats_search finds across cacheIds', () => {
    const { home, db } = tmpDb();
    try {
      const core = {
        hub: {
          getBound() {
            return { browserId: 'b-lib' };
          }
        }
      };
      const cache = new ChatCacheManager(db, core);
      const a = cache.persistAlways(
        {
          platform: 'perplexity',
          chatId: 'c1',
          title: 'alpha',
          messages: [
            { role: 'user', text: 'hello uniquezebra' },
            { role: 'assistant', text: 'world' }
          ]
        },
        { platform: 'perplexity', chatId: 'c1' }
      );
      const b = cache.persistAlways(
        {
          platform: 'chatgpt',
          chatId: 'c2',
          title: 'beta',
          messages: [{ role: 'user', text: 'other uniquezebra mention' }]
        },
        { platform: 'chatgpt', chatId: 'c2' }
      );
      assert.ok(a?.cacheId);
      assert.ok(b?.cacheId);
      assert.notEqual(a.cacheId, b.cacheId);

      const hits = cache.searchLibrary({ query: 'uniquezebra' });
      assert.equal(hits.matchCount, 2);
      const platforms = hits.hits.map((h) => h.platform).sort();
      assert.deepEqual(platforms, ['chatgpt', 'perplexity']);

      const onlyPx = cache.searchLibrary({ query: 'uniquezebra', platform: 'perplexity' });
      assert.equal(onlyPx.matchCount, 1);
      assert.equal(onlyPx.hits[0].chatId, 'c1');
    } finally {
      db.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('tab_snapshots replace + search by title substring', () => {
    const { home, db } = tmpDb();
    try {
      replaceTabSnapshots(db, 'b-1', [
        {
          tabId: 10,
          platform: 'perplexity',
          url: 'https://www.perplexity.ai/search/foo',
          chatId: 'abc',
          title: 'Gamebanana review notes'
        },
        {
          tabId: 11,
          platform: 'chatgpt',
          url: 'https://chatgpt.com/c/xyz',
          chatId: 'xyz',
          title: 'Unrelated'
        }
      ]);
      const found = searchTabSnapshots(db, { query: 'Gamebanana' });
      assert.equal(found.returned, 1);
      assert.equal(found.hits[0].chatId, 'abc');
      assert.equal(found.hits[0].platform, 'perplexity');
    } finally {
      db.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
