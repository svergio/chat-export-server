import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '@chat-export/protocol';
import { withServer, connectMockBrowser } from '../helpers.js';

describe('BrowserHub', () => {
  it('hello, bind, rpc, settings, timeout, unbind on close', async () => {
    await withServer(async (server) => {
      const { core, hub, port } = server;
      core.keyNew();

      const mock = await connectMockBrowser(port, {
        core,
        browserId: 'b-1',
        allowDestructive: false,
        onRpc: async (msg) => {
          if (msg.op === 'chats.list') {
            return { data: { items: [], nextCursor: null } };
          }
          await new Promise((r) => setTimeout(r, 50));
          return { data: { ok: true } };
        }
      });

      assert.equal(mock.welcome.bound, true);
      assert.equal(hub.listBrowsers().length, 1);

      const status = core.browsersBind('b-1');
      assert.equal(status.boundBrowserId, 'b-1');

      const listed = await core.chatsList('chatgpt', { limit: 5 });
      assert.deepEqual(listed, { items: [], nextCursor: null });

      mock.sendSettings({
        platformsEnabled: ['chatgpt'],
        allowDestructive: true,
        browserLabel: 'Renamed'
      });
      await new Promise((r) => setTimeout(r, 30));
      const b = hub.getBound();
      assert.deepEqual(b.platformsEnabled, ['chatgpt']);
      assert.equal(b.allowDestructive, true);
      assert.equal(b.browserLabel, 'Renamed');

      hub.rpcTimeoutMs = 40;
      await assert.rejects(
        () =>
          hub.rpc({
            op: 'chats.get',
            platform: 'chatgpt',
            args: { chatId: 'slow' }
          }),
        (e) => e.code === ERROR_CODES.TIMEOUT
      );

      const mock2 = await connectMockBrowser(port, {
        core,
        browserId: 'b-2',
        browserLabel: 'Second',
        onRpc: () => ({
          data: { items: [{ platform: 'chatgpt', chatId: '1', title: 't', url: 'u', updatedAt: null }], nextCursor: null }
        })
      });
      core.browsersBind('b-2');
      mock.close();
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(hub.browsers.has('b-1'), false);

      mock2.close();
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(hub.getBound(), null);
      await assert.rejects(() => core.chatsList('chatgpt', {}), (e) => e.code === ERROR_CODES.NOT_BOUND);
    });
  });

  it('rejects bad key on hello', async () => {
    await withServer(async (server) => {
      server.core.keyNew();
      await assert.rejects(
        () =>
          connectMockBrowser(server.port, {
            key: 'cek_deadbeefdeadbeefdeadbeefdeadbeef'
          }),
        /UNAUTHORIZED/
      );
    });
  });

  it('rebinds same browserId after short disconnect', async () => {
    await withServer(async (server) => {
      const { core, hub, port } = server;
      core.keyNew();
      const mock = await connectMockBrowser(port, {
        core,
        browserId: 'b-pref',
        onRpc: () => ({ data: { ok: true } })
      });
      core.browsersBind('b-pref');
      assert.equal(hub.boundBrowserId, 'b-pref');
      mock.close();
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(hub.getBound(), null);
      const mock2 = await connectMockBrowser(port, {
        core,
        browserId: 'b-pref',
        onRpc: () => ({ data: { ok: true } })
      });
      core.browsersBind('b-pref');
      assert.equal(hub.boundBrowserId, 'b-pref');
      assert.equal(mock2.welcome.bound, true);
      mock2.close();
    });
  });

  it('accepts /ext as alias of /ws', async () => {
    await withServer(async (server) => {
      server.core.keyNew();
      const mock = await connectMockBrowser(server.port, {
        core: server.core,
        browserId: 'b-ext',
        path: '/ext'
      });
      assert.equal(mock.welcome.browserId, 'b-ext');
      assert.equal(server.hub.browsers.has('b-ext'), true);
      mock.close();
    });
  });
});
