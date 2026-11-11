import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '@chat-export/protocol';
import { resolveExportOutDir } from '../../dist/core/export-files.js';
import { withServer, connectMockBrowser } from '../helpers.js';
import { extractBearer } from '../../dist/mcp/http.js';

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
        core,
        key,
        browserId: 'b-contract',
        allowDestructive: true,
        platformsEnabled: ['chatgpt', 'grok', 'grok-x', 'copilot', 'claude'],
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
      assert.equal(exported.files[0].text, undefined);
      assert.ok(exported.files[0].bytes > 0);
      assert.equal(exported.payload, undefined);
      assert.ok(typeof exported.turns === 'number');

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
        core,
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

  it('platform.capabilities, chats_send, and wire file forwarding', async () => {
    const caps = loadJson('capabilities-grok.json');
    const extended = loadJson('chats-create-extended.json');
    /** @type {object | null} */
    let lastCreateArgs = null;
    /** @type {object | null} */
    let lastSendArgs = null;

    await withServer(async (server, home) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      const allow = path.join(home, 'uploads');
      fs.mkdirSync(allow, { recursive: true });
      const notePath = path.join(allow, 'note.txt');
      fs.writeFileSync(notePath, 'attach-me\n');
      core.reloadConfig();

      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-extras',
        platformsEnabled: ['grok'],
        onRpc: (msg) => {
          if (msg.op === 'platform.capabilities') {
            return { data: { ...caps, refresh: Boolean(msg.args?.refresh) } };
          }
          if (msg.op === 'chats.create') {
            lastCreateArgs = msg.args;
            return {
              data: {
                platform: 'grok',
                chatId: 'new-1',
                title: msg.args.title || 't',
                url: 'https://example.com/c/new-1',
                updatedAt: null
              }
            };
          }
          if (msg.op === 'chats.send') {
            lastSendArgs = msg.args;
            return {
              data: {
                platform: 'grok',
                chatId: msg.args.chatId,
                title: 'follow-up',
                url: 'https://example.com/c/' + msg.args.chatId,
                updatedAt: null
              }
            };
          }
          return { data: { ok: true } };
        }
      });
      core.browsersBind('b-extras');

      const gotCaps = await core.platformCapabilities('grok', { refresh: true });
      assert.equal(gotCaps.platform, 'grok');
      assert.ok(gotCaps.models.length > 0);

      await core.chatsCreate('grok', {
        text: 'hi',
        model: 'fast',
        files: [{ path: notePath }]
      });
      assert.ok(lastCreateArgs);
      assert.equal(lastCreateArgs.model, 'fast');
      assert.equal(lastCreateArgs.files?.length, 1);
      assert.equal(lastCreateArgs.files[0].name, 'note.txt');
      assert.ok(lastCreateArgs.files[0].b64);
      assert.equal('path' in lastCreateArgs.files[0], false);

      await core.chatsSend('grok', { chatId: 'c-9', text: 'again', mode: 'build' });
      assert.ok(lastSendArgs);
      assert.equal(lastSendArgs.chatId, 'c-9');
      assert.equal(lastSendArgs.mode, 'build');

      const audit = core.readAudit();
      const createAudit = audit.find((e) => e.action === 'chats.create' && e.ok === true);
      assert.ok(createAudit?.args?.files?.every((f) => f.name && f.size && !f.b64));

      assert.deepEqual(extended.wire.files[0].name, 'note.txt');
    });
  });

  it('rejects disallowed attachment paths before rpc', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-files',
        platformsEnabled: ['grok'],
        onRpc: () => ({ data: {} })
      });
      core.browsersBind('b-files');
      await assert.rejects(
        async () => {
          await core.chatsCreate('grok', { text: 'x', files: [{ path: '/etc/hosts' }] });
        },
        (e) => e.code === ERROR_CODES.FILE_NOT_ALLOWED
      );
    });
  });

  it('tools.js registers capabilities, send, and create option/file args', () => {
    const toolsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist/mcp/tools.js');
    const src = fs.readFileSync(toolsPath, 'utf8');
    for (const name of [
      'browsers_list',
      'browsers_bind',
      'browsers_status',
      'session',
      'platforms_list',
      'platforms_capabilities',
      'chats_list',
      'chats_get',
      'chat_outline',
      'chat_read',
      'chat_ask',
      'chats_ask_selection',
      'chats_side_ask',
      'containers_list',
      'projects_list',
      'projects_chats',
      'projects_create',
      'projects_delete',
      'projects_move_chat',
      'chat_cache_sync',
      'chat_cache_read',
      'chat_cache_append',
      'chat_cache_update_block',
      'chat_cache_delete',
      'chats_export',
      'chats_create',
      'chats_send',
      'chats_delete'
    ]) {
      assert.match(src, new RegExp("'" + name + "'"));
    }
    assert.match(src, /chats_create[\s\S]*?model:\s*z\.string\(\)\.optional/);
    assert.match(src, /chats_create[\s\S]*?mode:\s*z\.string\(\)\.optional/);
    assert.match(src, /chats_create[\s\S]*?toggles:\s*OptionIds/);
    assert.match(src, /chats_create[\s\S]*?files:\s*z\.array\(FileRef\)/);
    assert.match(src, /chats_send[\s\S]*?files:\s*z\.array\(FileRef\)/);
  });

  it('accepts claude platform enum on list/get', async () => {
    const list = loadJson('chats-list.json');
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-claude',
        platformsEnabled: ['claude'],
        onRpc: (msg) => {
          if (msg.op === 'chats.list' && msg.platform === 'claude') {
            return {
              data: {
                items: list.items.map((c) => ({ ...c, platform: 'claude' })),
                nextCursor: null
              }
            };
          }
          return { data: { ok: true } };
        }
      });
      core.browsersBind('b-claude');
      const listed = await core.chatsList('claude', { limit: 5 });
      assert.equal(listed.items[0].platform, 'claude');
    });
  });

  it('chats_export outDir: rejects relative and outside HOME', async () => {
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-outdir-gate',
        platformsEnabled: ['chatgpt'],
        onRpc: () => ({ data: { files: [], payload: {} } })
      });
      core.browsersBind('b-outdir-gate');
      await assert.rejects(
        () => core.chatsExport('chatgpt', { chatId: 'x', formats: ['md'], outDir: 'exports/out' }),
        (e) => e.code === ERROR_CODES.INVALID_ARGS
      );
      await assert.rejects(
        () => core.chatsExport('chatgpt', { chatId: 'x', formats: ['md'], outDir: '/etc' }),
        (e) => e.code === ERROR_CODES.INVALID_ARGS
      );
    });
  });

  it('chats_export outDir writes flat files under HOME', async () => {
    const exportPayload = loadJson('export-payload-chatgpt.json');
    const flatRoot = path.join(
      os.homedir(),
      '.chat-export-test-flat-' + Date.now()
    );
    fs.mkdirSync(flatRoot, { recursive: true, mode: 0o700 });

    try {
      assert.equal(resolveExportOutDir(flatRoot), path.resolve(flatRoot));

      await withServer(async (server) => {
        const { core, port } = server;
        const { key } = core.keyNew();
        await connectMockBrowser(port, {
        core,
          key,
          browserId: 'b-flat',
          platformsEnabled: ['chatgpt'],
          onRpc: (msg) => {
            if (msg.op === 'chats.export') {
              return {
                data: {
                  files: [
                    {
                      name: 'chatgpt-test.md',
                      mime: 'text/markdown;charset=utf-8',
                      text: '# flat\n'
                    }
                  ],
                  payload: exportPayload
                }
              };
            }
            return { data: {} };
          }
        });
        core.browsersBind('b-flat');

        const exported = await core.chatsExport('chatgpt', {
          chatId: exportPayload.chatId,
          formats: ['md'],
          outDir: flatRoot
        });
        assert.equal(exported.dir, path.resolve(flatRoot));
        assert.equal(exported.paths.length, 1);
        const base = path.basename(exported.paths[0]);
        assert.match(base, /^chatgpt-.*\.md$/);
        assert.ok(!exported.paths[0].includes(path.sep + 'chatgpt' + path.sep + exportPayload.chatId));
        assert.equal(fs.readFileSync(exported.paths[0], 'utf8'), '# flat\n');
        assert.equal(exported.files[0].name, base);
      });
    } finally {
      fs.rmSync(flatRoot, { recursive: true, force: true });
    }
  });

  it('chats_export forwards branch to extension, never outDir', async () => {
    const exportPayload = loadJson('export-payload-chatgpt.json');
    const seen = [];
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-branch',
        platformsEnabled: ['chatgpt'],
        onRpc: (msg) => {
          if (msg.op === 'chats.export') {
            seen.push(msg.args);
            return {
              data: {
                files: [{ name: 'chatgpt-test.md', mime: 'text/markdown;charset=utf-8', text: '# b\n' }],
                payload: exportPayload
              }
            };
          }
          return { data: {} };
        }
      });
      core.browsersBind('b-branch');

      await core.chatsExport('chatgpt', { chatId: exportPayload.chatId, formats: ['md'], branch: 'all' });
      await core.chatsExport('chatgpt', { chatId: exportPayload.chatId, formats: ['md'] });
      assert.deepEqual(seen[0], { chatId: exportPayload.chatId, formats: ['md'], branch: 'all' });
      assert.deepEqual(seen[1], { chatId: exportPayload.chatId, formats: ['md'] });
    });
  });

  it('chat_outline and chat_read slice ExportPayload without full dump', async () => {
    const exportPayload = loadJson('export-payload-chatgpt.json');
    await withServer(async (server) => {
      const { core, port } = server;
      const { key } = core.keyNew();
      await connectMockBrowser(port, {
        core,
        key,
        browserId: 'b-views',
        platformsEnabled: ['chatgpt'],
        onRpc: (msg) => {
          if (msg.op === 'chats.get') return { data: exportPayload };
          return { data: {} };
        }
      });
      core.browsersBind('b-views');
      const outline = await core.chatOutline('chatgpt', { chatId: exportPayload.chatId });
      assert.equal(outline.chatId, exportPayload.chatId);
      assert.ok(outline.total >= 1);
      assert.ok(outline.turns[0].preview !== undefined);
      assert.equal(outline.turns[0].text, undefined);

      const read = await core.chatRead('chatgpt', {
        chatId: exportPayload.chatId,
        start: 0,
        end: 0,
        maxChars: 80
      });
      assert.equal(read.turns.length, 1);
      assert.ok(read.turns[0].text.length <= 80);
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
