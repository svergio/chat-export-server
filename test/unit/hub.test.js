import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '@chat-export/protocol';
import { withServer, connectMockBrowser, makeBrowserToken } from '../helpers.js';

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

  it('re-enroll invalidates prior cek_/ceb_ tokens for same browserId', async () => {
    await withServer(async (server) => {
      const { core, hub, port } = server;
      core.keyNew();
      const browserId = 'b-5b508c84';
      const legacyKey = 'cek_' + 'a'.repeat(48);
      const first = core.browserEnroll({
        browserId,
        key: legacyKey,
        browserLabel: 'Legacy'
      });
      assert.equal(first.superseded, false);

      const live = await connectMockBrowser(port, {
        key: legacyKey,
        browserId,
        browserLabel: 'Legacy'
      });
      assert.equal(hub.browsers.has(browserId), true);

      const nextKey = makeBrowserToken('rotate-ceb-1');
      const rotated = core.browserEnroll({
        browserId,
        key: nextKey,
        previousKey: legacyKey,
        browserLabel: 'Rotated'
      });
      assert.equal(rotated.browserId, browserId);
      assert.equal(rotated.superseded, true);
      assert.notEqual(rotated.fingerprint, first.fingerprint);

      await new Promise((r) => setTimeout(r, 40));
      assert.equal(hub.browsers.has(browserId), false);

      await assert.rejects(
        () =>
          connectMockBrowser(port, {
            key: legacyKey,
            browserId,
            browserLabel: 'Legacy'
          }),
        /UNAUTHORIZED/
      );

      const replaced = makeBrowserToken('rotate-ceb-2');
      const again = core.browserEnroll({
        browserId,
        key: replaced,
        previousKey: nextKey,
        browserLabel: 'Rotated again'
      });
      assert.equal(again.browserId, browserId);
      assert.equal(again.superseded, true);

      await assert.rejects(
        () =>
          connectMockBrowser(port, {
            key: nextKey,
            browserId
          }),
        /UNAUTHORIZED/
      );

      const ok = await connectMockBrowser(port, {
        key: replaced,
        browserId,
        browserLabel: 'Rotated again'
      });
      assert.equal(ok.welcome.browserId, browserId);
      ok.close();
      live.close();
    });
  });

  it('enroll assigns server-owned browserId by ceb_ key (ignores stolen claimed id)', async () => {
    await withServer(async (server) => {
      const { core } = server;
      core.keyNew();
      const keyA = makeBrowserToken('own-a');
      const keyB = makeBrowserToken('own-b');
      const a = core.browserEnroll({
        browserId: 'b-claimed-a',
        key: keyA,
        browserLabel: 'A'
      });
      assert.equal(a.browserId, 'b-claimed-a');
      const b = core.browserEnroll({
        // Clone profile still claims A's id but holds a different key → server mints a new id
        browserId: 'b-claimed-a',
        key: keyB,
        browserLabel: 'B'
      });
      assert.notEqual(b.browserId, a.browserId);
      assert.match(b.browserId, /^b-[a-f0-9]{8}$/);
      const again = core.browserEnroll({
        browserId: 'totally-wrong',
        key: keyB,
        browserLabel: 'B2'
      });
      assert.equal(again.browserId, b.browserId);
    });
  });

  it('hello remaps cloned browserId when ceb_ key belongs to another row', async () => {
    await withServer(async (server) => {
      const { core, hub, port } = server;
      core.keyNew();
      const loggedInId = 'b-logged';
      const loggedOutId = 'b-logged-out';
      const keyA = makeBrowserToken('key-a-logged-in');
      const keyB = makeBrowserToken('key-b-logged-out');
      core.browserEnroll({ browserId: loggedInId, key: keyA, browserLabel: 'ЗАЛОГИНЕНЫЕ' });
      core.browserEnroll({ browserId: loggedOutId, key: keyB, browserLabel: 'НЕЗАЛОГИНЕНЫЕ' });

      const a = await connectMockBrowser(port, {
        key: keyA,
        browserId: loggedInId,
        browserLabel: 'ЗАЛОГИНЕНЫЕ'
      });
      // Profile clone still claims loggedInId but holds keyB
      const b = await connectMockBrowser(port, {
        key: keyB,
        browserId: loggedInId,
        browserLabel: 'НЕЗАЛОГИНЕНЫЕ'
      });
      assert.equal(a.welcome.browserId, loggedInId);
      assert.equal(b.welcome.browserId, loggedOutId);
      assert.equal(hub.browsers.has(loggedInId), true);
      assert.equal(hub.browsers.has(loggedOutId), true);
      assert.equal(hub.listBrowsers().filter((x) => x.status === 'online' || hub.browsers.has(x.browserId)).length >= 2, true);
      a.close();
      b.close();
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
