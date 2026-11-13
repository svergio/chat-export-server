import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { ServerCore } from '../../dist/core/server-core.js';
import { assertAdvancedMcpTos } from '../../dist/core/settings.js';
import { tempHome } from '../helpers.js';

describe('advanced MCP ToS gate', () => {
  it('assertAdvancedMcpTos rejects create/delete without acceptance', () => {
    assert.throws(
      () => assertAdvancedMcpTos('chats.create', { advancedMcpTosAcceptedAt: null }),
      (err) => err instanceof ProtocolError && err.code === ERROR_CODES.BAD_REQUEST
    );
    assert.throws(
      () => assertAdvancedMcpTos('chats.delete', {}),
      (err) => err.code === ERROR_CODES.BAD_REQUEST
    );
    assert.doesNotThrow(() =>
      assertAdvancedMcpTos('chats.create', { advancedMcpTosAcceptedAt: '2026-01-01T00:00:00.000Z' })
    );
    assert.doesNotThrow(() => assertAdvancedMcpTos('chats.list', { advancedMcpTosAcceptedAt: null }));
  });

  it('acceptAdvancedMcpTos unlocks create via callOp', async () => {
    const home = tempHome('ce-tos-');
    try {
      const core = new ServerCore({
        home,
        hub: {
          getBound: () => ({
            browserId: 'b-1',
            tabs: [],
            platformsEnabled: ['chatgpt'],
            allowCreate: true,
            allowDestructive: true,
            allowProjects: true
          }),
          rpc: async () => ({ chatId: 'c1', ok: true })
        }
      });
      assert.equal(core.legalStatus().advancedMcpTosAccepted, false);
      await assert.rejects(
        () => core.callOp('chats.create', 'chatgpt', { text: 'hi' }),
        (err) => err.code === ERROR_CODES.BAD_REQUEST && /ToS/i.test(err.message)
      );
      core.acceptAdvancedMcpTos('2026-04-01T12:00:00.000Z');
      assert.equal(core.legalStatus().advancedMcpTosAccepted, true);
      const created = await core.callOp('chats.create', 'chatgpt', { text: 'hi' });
      assert.equal(created.chatId, 'c1');
      core.close();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
