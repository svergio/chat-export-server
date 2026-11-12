import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_CODES } from '@chat-export/protocol';
import {
  loadFiles,
  defaultAttachmentsConfig,
  DEFAULT_MAX_FILE_BYTES,
  rpcTimeoutForArgs,
  EXPORT_RPC_TIMEOUT_MS,
  EXPORT_HEAVY_RPC_TIMEOUT_MS,
  SEND_RPC_TIMEOUT_MS
} from '../../dist/core/attachments.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ce-att-'));
}

describe('attachments.loadFiles', () => {
  it('allowlist: reads file under allowed dir', () => {
    const home = tempDir();
    const allow = path.join(home, 'uploads');
    fs.mkdirSync(allow, { recursive: true });
    const file = path.join(allow, 'note.txt');
    fs.writeFileSync(file, 'hello world\n');
    const config = { home, attachments: { allowDirs: [allow] } };
    const wire = loadFiles([{ path: file }], config);
    assert.equal(wire.length, 1);
    assert.equal(wire[0].name, 'note.txt');
    assert.equal(wire[0].mime, 'text/plain');
    assert.equal(wire[0].size, 12);
    assert.equal(Buffer.from(wire[0].b64, 'base64').toString('utf8'), 'hello world\n');
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('rejects paths outside allowlist', () => {
    const home = tempDir();
    const allow = path.join(home, 'uploads');
    fs.mkdirSync(allow, { recursive: true });
    const config = { home, attachments: { allowDirs: [allow] } };
    assert.throws(
      () => loadFiles([{ path: '/etc/hosts' }], config),
      (e) => e.code === ERROR_CODES.FILE_NOT_ALLOWED
    );
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('rejects symlink escape to outside allowlist', () => {
    const home = tempDir();
    const allow = path.join(home, 'uploads');
    fs.mkdirSync(allow, { recursive: true });
    const link = path.join(allow, 'escape');
    try {
      fs.symlinkSync('/etc/hosts', link);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'ENOENT') {
        fs.rmSync(home, { recursive: true, force: true });
        return;
      }
      throw err;
    }
    const config = { home, attachments: { allowDirs: [allow] } };
    assert.throws(
      () => loadFiles([{ path: link }], config),
      (e) => e.code === ERROR_CODES.FILE_NOT_ALLOWED
    );
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('enforces maxFileBytes and maxTotalBytes', () => {
    const home = tempDir();
    const allow = path.join(home, 'uploads');
    fs.mkdirSync(allow, { recursive: true });
    const big = path.join(allow, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(1024));
    const config = {
      home,
      attachments: { allowDirs: [allow], maxFileBytes: 512, maxTotalBytes: 600 }
    };
    assert.throws(
      () => loadFiles([{ path: big }], config),
      (e) => e.code === ERROR_CODES.FILE_TOO_LARGE
    );

    const a = path.join(allow, 'a.bin');
    const b = path.join(allow, 'b.bin');
    fs.writeFileSync(a, Buffer.alloc(400));
    fs.writeFileSync(b, Buffer.alloc(400));
    assert.throws(
      () => loadFiles([{ path: a }, { path: b }], config),
      (e) => e.code === ERROR_CODES.FILE_TOO_LARGE
    );
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('mime from extension and explicit override', () => {
    const home = tempDir();
    const allow = path.join(home, 'uploads');
    fs.mkdirSync(allow, { recursive: true });
    const img = path.join(allow, 'x.dat');
    fs.writeFileSync(img, 'x');
    const config = { home, attachments: { allowDirs: [allow] } };
    const wireDefault = loadFiles([{ path: img }], config);
    assert.equal(wireDefault[0].mime, 'application/octet-stream');
    const wireOverride = loadFiles([{ path: img, mime: 'image/png' }], config);
    assert.equal(wireOverride[0].mime, 'image/png');
    const png = path.join(allow, 'a.png');
    fs.writeFileSync(png, 'x');
    assert.equal(loadFiles([{ path: png }], config)[0].mime, 'image/png');
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('defaultAttachmentsConfig includes uploads and Downloads', () => {
    const home = tempDir();
    const def = defaultAttachmentsConfig(home);
    assert.ok(def.allowDirs.some((d) => d.includes('uploads')));
    assert.ok(def.allowDirs.some((d) => d.includes('Downloads')));
    assert.equal(def.maxFileBytes, DEFAULT_MAX_FILE_BYTES);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

describe('attachments.rpcTimeoutForArgs', () => {
  it('keeps base for plain ops and scales with file bytes', () => {
    assert.equal(rpcTimeoutForArgs(60_000, { chatId: 'x' }, 'chats.get'), 60_000);
    assert.equal(rpcTimeoutForArgs(60_000, { files: [{ size: 512 * 1024 }] }, 'chats.create'), SEND_RPC_TIMEOUT_MS);
  });

  it('raises chats.export timeout, more for pdf / many formats / all branches', () => {
    assert.equal(rpcTimeoutForArgs(60_000, { formats: ['md'] }, 'chats.export'), EXPORT_RPC_TIMEOUT_MS);
    assert.equal(rpcTimeoutForArgs(60_000, { formats: ['pdf'] }, 'chats.export'), EXPORT_HEAVY_RPC_TIMEOUT_MS);
    assert.equal(
      rpcTimeoutForArgs(60_000, { formats: ['md', 'json', 'html'] }, 'chats.export'),
      EXPORT_HEAVY_RPC_TIMEOUT_MS
    );
    assert.equal(
      rpcTimeoutForArgs(60_000, { formats: ['md'], branch: 'all' }, 'chats.export'),
      EXPORT_HEAVY_RPC_TIMEOUT_MS
    );
    assert.equal(rpcTimeoutForArgs(400_000, { formats: ['pdf'] }, 'chats.export'), 400_000);
  });
});
