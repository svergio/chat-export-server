import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { WS_TYPES, PROTOCOL_VERSION, PLATFORMS } from '@chat-export/protocol';
import { startServer } from '../dist/server.js';
import { MCP_TOKEN_PREFIX } from '../dist/core/keys.js';

export function tempHome(prefix = 'chat-export-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function withServer(fn, opts = {}) {
  const home = opts.home || tempHome();
  const prevSkip = process.env.CHAT_EXPORT_SKIP_MCP_CONFIG;
  process.env.CHAT_EXPORT_SKIP_MCP_CONFIG = '1';
  const server = await startServer({
    home,
    port: 0,
    stdio: false,
    ...opts
  });
  try {
    return await fn(server, home);
  } finally {
    await server.close();
    fs.rmSync(home, { recursive: true, force: true });
    if (prevSkip === undefined) delete process.env.CHAT_EXPORT_SKIP_MCP_CONFIG;
    else process.env.CHAT_EXPORT_SKIP_MCP_CONFIG = prevSkip;
  }
}

export function makeBrowserToken(seed = '') {
  const hex = (seed + '0'.repeat(48)).replace(/[^a-f0-9]/gi, 'a').slice(0, 48);
  return 'ceb_' + hex.padEnd(48, '0');
}

export function enrollTestBrowser(core, browserId, opts = {}) {
  const key =
    opts.key && !opts.key.startsWith(MCP_TOKEN_PREFIX)
      ? opts.key
      : makeBrowserToken(browserId);
  core.browserEnroll({
    browserId,
    key,
    browserLabel: opts.browserLabel || browserId,
    allowDestructive: Boolean(opts.allowDestructive),
    allowCreate: opts.allowCreate !== false,
    allowProjects: opts.allowProjects !== false
  });
  return key;
}

export function connectMockBrowser(port, opts = {}) {
  const {
    core,
    key: keyIn,
    browserId = 'b-test-1',
    browserLabel = 'Test Browser',
    platformsEnabled = [...PLATFORMS],
    allowDestructive = false,
    allowCreate = true,
    allowProjects = true,
    tabs = [],
    path = '/ws',
    onRpc
  } = opts;

  let key = keyIn;
  if (core) {
    key = enrollTestBrowser(core, browserId, {
      key,
      browserLabel,
      allowDestructive,
      allowCreate,
      allowProjects
    });
  } else if (!key || key.startsWith(MCP_TOKEN_PREFIX)) {
    key = makeBrowserToken(browserId);
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: WS_TYPES.HELLO,
          protocolVersion: PROTOCOL_VERSION,
          key,
          browserId,
          browserLabel,
          extVersion: '1.6.0',
          platformsEnabled,
          allowDestructive,
          allowCreate,
          allowProjects,
          tabs
        })
      );
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.type === WS_TYPES.WELCOME) {
        resolve({
          ws,
          welcome: msg,
          sendSettings(settings) {
            ws.send(JSON.stringify({ type: WS_TYPES.SETTINGS, ...settings }));
          },
          close() {
            ws.close();
          }
        });
        return;
      }
      if (msg.type === WS_TYPES.ERROR) {
        reject(new Error(msg.code + ': ' + msg.message));
        return;
      }
      if (msg.type === WS_TYPES.RPC) {
        Promise.resolve(onRpc ? onRpc(msg) : defaultRpc(msg))
          .then((result) => {
            if (result && result.ok === false) {
              ws.send(
                JSON.stringify({
                  type: WS_TYPES.RPC_RESULT,
                  id: msg.id,
                  ok: false,
                  error: result.error
                })
              );
            } else {
              ws.send(
                JSON.stringify({
                  type: WS_TYPES.RPC_RESULT,
                  id: msg.id,
                  ok: true,
                  data: result?.data !== undefined ? result.data : result
                })
              );
            }
          })
          .catch((err) => {
            ws.send(
              JSON.stringify({
                type: WS_TYPES.RPC_RESULT,
                id: msg.id,
                ok: false,
                error: { code: 'HOST_ERROR', message: err.message || String(err) }
              })
            );
          });
      }
    });

    ws.on('error', reject);
  });
}

function defaultRpc(msg) {
  return { data: { echo: true, op: msg.op, platform: msg.platform, args: msg.args } };
}

export function loadFixture(name) {
  const p = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'packages',
    'protocol',
    'fixtures',
    name
  );
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
