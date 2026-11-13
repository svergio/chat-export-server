import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ERROR_CODES } from '@chat-export/protocol';
import { ServerCore } from '../../dist/core/server-core.js';
import { tempHome } from '../helpers.js';

describe('resolveChatId', () => {
  it('does not match short title substrings (id "2" vs title containing 2)', async () => {
    const home = tempHome('ce-resolve-');
    try {
      const core = new ServerCore({
        home,
        hub: {
          getBound: () => ({
            browserId: 'b-1',
            tabs: [],
            platformsEnabled: ['chatgpt'],
            allowCreate: true,
            allowDestructive: false,
            allowProjects: true
          }),
          rpc: async ({ op }) => {
            if (op === 'chats.get') {
              const err = new Error('missing');
              err.code = ERROR_CODES.NOT_FOUND;
              throw err;
            }
            if (op === 'chats.list') {
              return {
                items: [
                  { chatId: 'chat-aaa', title: 'Chapter 2 notes' },
                  { chatId: 'chat-bbb', title: 'Exact Match Title' }
                ]
              };
            }
            return {};
          }
        }
      });
      await assert.rejects(() => core.resolveChatId('chatgpt', '2'), (err) => err.code === ERROR_CODES.NOT_FOUND);
      const exactTitle = await core.resolveChatId('chatgpt', 'Exact Match Title');
      assert.equal(exactTitle, 'chat-bbb');
      core.close();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
