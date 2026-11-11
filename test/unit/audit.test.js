import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendAudit, readAuditLines } from '../../dist/core/audit.js';

describe('audit', () => {
  it('append-only jsonl write and read', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cek-audit-'));
    const auditPath = path.join(home, 'audit.log');
    try {
      appendAudit(auditPath, { action: 'chats.delete', ok: false, code: 'CONFIRM_REQUIRED' });
      appendAudit(auditPath, { action: 'chats.delete', ok: true, chatId: 'x' });
      const lines = readAuditLines(auditPath);
      assert.equal(lines.length, 2);
      assert.equal(lines[0].action, 'chats.delete');
      assert.ok(lines[0].ts);
      assert.equal(lines[1].ok, true);
      const raw = fs.readFileSync(auditPath, 'utf8');
      assert.equal(raw.trim().split('\n').length, 2);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
