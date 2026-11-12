import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_CODES } from '@chat-export/protocol';
import { writeExportFiles, resolveExportOutDir } from '../../dist/core/export-files.js';

describe('export path hardening', () => {
  it('strips path traversal in file names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-export-'));
    try {
      const { files } = writeExportFiles(dir, { platform: 'chatgpt', chatId: 'c1' }, [
        { name: '../../../etc/passwd', mime: 'text/plain', text: 'nope' },
        { name: '..\\..\\win.ini', mime: 'text/plain', text: 'nope' }
      ]);
      assert.equal(files.length, 2);
      for (const f of files) {
        const rel = path.relative(dir, f.path);
        assert.ok(!rel.startsWith('..') && !path.isAbsolute(rel));
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reject outDir outside HOME', () => {
    assert.throws(
      () => resolveExportOutDir('/tmp/not-home-chat-export'),
      (e) => e.code === ERROR_CODES.BAD_REQUEST
    );
  });
});
