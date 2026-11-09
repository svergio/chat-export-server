import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '@chat-export/protocol';
import { withServer, connectMockBrowser } from '../helpers.js';
import { extractBearer } from '../../src/mcp/http.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'protocol',
  'fixtures'
);

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function rpcFixtureMap() {
  const rows = loadJson('rpc.json');
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const row of rows) {
    if (row.response?.ok) {
      map.set(row.op + ':' + row.request.platform, row.response.data);
    }
  }
  return map;
}

describe('MCP contract (mock extension)', () => {
  it('happy path tools via core + export writes files', async () => {
    const fixtures = rpcFixtureMap();
    const exportPayload = loadJson('export-payload-chatgpt.json');
    const list = loadJson('chats-list.json');

    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();

      await connectMockBrowser(port, {
        key,
        browserId: 'b-contract',
        allowDestructive: true,
        platformsEnabled: ['chatgpt', 'grok', 'grok-x', 'copilot'],
        onRpc: (msg) => {
          if (msg.op === 'chats.list' && msg.platform === 'chatgpt') {
            return { data: list };
          }
          if (msg.op === 'chats.get' && msg.platform === 'chatgpt') {
            return { data: exportPayload };
          }
          if (msg.op === 'chats.export' && msg.platform === 'chatgpt') {
            return {
              data: {
                files: [
                  {
                    name: 'chatgpt-test.md',
                    mime: 'text/markdown;charset=utf-8',
                    text: '# hello\n'
                  },
                  {
                    name: 'chatgpt-test.json',
                    mime: 'application/json',
                    text: JSON.stringify(exportPayload)
                  }
                ],
                payload: exportPayload
              }
            };
          }
          if (msg.op === 'chats.create') {
            return { data: fixtures.get('chats.create:grok-x') };
          }
          if (msg.op === 'chats.delete') {
            return {
              data: {
                deleted: true,
                chatId: msg.args.chatId
              }
            };
          }
          const hit = fixtures.get(msg.op + ':' + msg.platform);
          if (hit) return { data: hit };
          return {
            ok: false,
            error: { code: 'HOST_ERROR', message: 'no fixture for ' + msg.op }
          };
        }
      });

      core.updateServerSettings({ allowDestructive: true });
      assert.equal(core.browsersList().length, 1);
      core.browsersBind('b-contract');
      assert.equal(core.browsersStatus().boundBrowserId, 'b-contract');

      const platforms = core.platformsList();
      assert.ok(platforms.platforms.some((p) => p.id === 'chatgpt' && p.enabled));

      const listed = await core.chatsList('chatgpt', { limit: 20 });
      assert.equal(listed.items.length, list.items.length);

      const got = await core.chatsGet('chatgpt', { chatId: exportPayload.chatId });
      assert.equal(got.chatId, exportPayload.chatId);

      const exported = await core.chatsExport('chatgpt', {
        chatId: exportPayload.chatId,
        formats: ['md', 'json']
      });
      assert.equal(exported.paths.length, 2);
      assert.ok(fs.existsSync(exported.paths[0]));
      assert.ok(exported.files[0].text);

      const created = await core.chatsCreate('grok-x', { text: '[ce-test] ping', title: '[ce-test] ping' });
      assert.equal(created.platform, 'grok-x');

      const deleted = await core.chatsDelete(
        'chatgpt',
        { chatId: exportPayload.chatId },
        { confirm: true }
      );
      assert.equal(deleted.deleted, true);

      const audit = core.readAudit();
      assert.ok(audit.some((e) => e.action === 'chats.delete' && e.ok === true));
    });
  });

  it('gates: NOT_BOUND, PLATFORM_DISABLED, CONFIRM_REQUIRED, DESTRUCTIVE_DISABLED', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();

      await assert.rejects(() => core.chatsList('chatgpt', {}), (e) => e.code === ERROR_CODES.NOT_BOUND);

      await connectMockBrowser(port, {
        key,
        browserId: 'b-gates',
        platformsEnabled: ['grok'],
        allowDestructive: false,
        onRpc: () => ({ data: { deleted: true } })
      });
      core.browsersBind('b-gates');

      await assert.rejects(
        () => core.chatsList('chatgpt', {}),
        (e) => e.code === ERROR_CODES.PLATFORM_DISABLED
      );

      await assert.rejects(
        () => core.chatsDelete('grok', { chatId: 'x' }, { confirm: false }),
        (e) => e.code === ERROR_CODES.CONFIRM_REQUIRED
      );
      await assert.rejects(
        () => core.chatsDelete('grok', { chatId: 'x' }, { confirm: true }),
        (e) => e.code === ERROR_CODES.DESTRUCTIVE_DISABLED
      );

      const audit = core.readAudit();
      assert.ok(audit.some((e) => e.action === 'chats.delete' && e.code === ERROR_CODES.CONFIRM_REQUIRED));
      assert.ok(audit.some((e) => e.action === 'chats.delete' && e.code === ERROR_CODES.DESTRUCTIVE_DISABLED));
    });
  });

  it('HTTP /mcp rejects bad bearer with 401 and never echoes key', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      core.keyNew();
      const bad = 'cek_this_is_not_a_valid_key_value_xx';
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + bad,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      });
      assert.equal(res.status, 401);
      const body = await res.text();
      assert.equal(body.includes(bad), false);
      assert.ok(body.includes('UNAUTHORIZED'));

      const fakeReq = { headers: { authorization: 'Bearer ' + bad } };
      assert.equal(extractBearer(fakeReq), bad);

      const audit = core.readAudit();
      assert.ok(audit.some((e) => e.action === 'mcp.auth' && e.ok === false));
      assert.equal(JSON.stringify(audit).includes(bad), false);
    });
  });
});
