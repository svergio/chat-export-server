import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateKey,
  hashKey,
  verifyKey,
  createOrReplaceKey,
  listKeyMeta,
  verifyAgainstStore
} from '../../src/core/keys.js';

describe('keys', () => {
  it('generate/hash/verify', () => {
    const key = generateKey();
    assert.match(key, /^cek_[0-9a-f]+$/);
    const hashed = hashKey(key);
    assert.equal(verifyKey(key, hashed), true);
    assert.equal(verifyKey(key + 'x', hashed), false);
    assert.equal(verifyKey('', hashed), false);
  });

  it('create, store hash only, rotate', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cek-keys-'));
    const keysPath = path.join(home, 'keys.json');
    try {
      const first = createOrReplaceKey(keysPath);
      assert.ok(first.key.startsWith('cek_'));
      const stored = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      assert.ok(stored.active.hash);
      assert.ok(stored.active.salt);
      assert.equal(JSON.stringify(stored).includes(first.key), false);
      assert.equal(verifyAgainstStore(first.key, keysPath), true);

      const mode = fs.statSync(keysPath).mode & 0o777;
      assert.equal(mode, 0o600);

      const second = createOrReplaceKey(keysPath, { rotate: true });
      assert.notEqual(second.key, first.key);
      assert.equal(verifyAgainstStore(first.key, keysPath), false);
      assert.equal(verifyAgainstStore(second.key, keysPath), true);
      const meta = listKeyMeta(keysPath);
      assert.equal(meta.active.id, second.record.id);
      assert.equal(meta.revoked.length, 1);
      assert.equal(meta.revoked[0].id, first.record.id);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
