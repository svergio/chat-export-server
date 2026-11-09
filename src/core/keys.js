import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chmodSync } from 'node:fs';

const SCRYPT_KEYLEN = 32;

export function generateKey() {
  return 'cek_' + randomBytes(24).toString('hex');
}

export function hashKey(key, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(key, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash, fingerprint: fingerprintOf(key) };
}

export function fingerprintOf(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export function verifyKey(key, record) {
  if (!key || !record?.salt || !record?.hash) return false;
  let derived;
  try {
    derived = scryptSync(key, record.salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  const expected = Buffer.from(record.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * @param {string} keysPath
 * @returns {{ version: number, active: object | null, revoked: object[] }}
 */
export function loadKeys(keysPath) {
  if (!fs.existsSync(keysPath)) {
    return { version: 1, active: null, revoked: [] };
  }
  const raw = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  return {
    version: raw.version || 1,
    active: raw.active || null,
    revoked: Array.isArray(raw.revoked) ? raw.revoked : []
  };
}

export function saveKeys(keysPath, store) {
  fs.mkdirSync(path.dirname(keysPath), { recursive: true, mode: 0o700 });
  const tmp = keysPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, keysPath);
  try {
    chmodSync(keysPath, 0o600);
  } catch {
    /* ignore on platforms without chmod */
  }
}

/**
 * @param {string} keysPath
 * @returns {{ key: string, record: object }}
 */
export function createOrReplaceKey(keysPath, { rotate = false } = {}) {
  const store = loadKeys(keysPath);
  const key = generateKey();
  const hashed = hashKey(key);
  const now = new Date().toISOString();
  const record = {
    id: 'k_' + randomBytes(6).toString('hex'),
    salt: hashed.salt,
    hash: hashed.hash,
    fingerprint: hashed.fingerprint,
    createdAt: now
  };
  if (rotate && store.active) {
    store.revoked.push({
      ...store.active,
      revokedAt: now
    });
  }
  store.active = record;
  saveKeys(keysPath, store);
  return { key, record };
}

export function listKeyMeta(keysPath) {
  const store = loadKeys(keysPath);
  return {
    active: store.active
      ? {
          id: store.active.id,
          fingerprint: store.active.fingerprint,
          createdAt: store.active.createdAt
        }
      : null,
    revoked: store.revoked.map((r) => ({
      id: r.id,
      fingerprint: r.fingerprint,
      createdAt: r.createdAt,
      revokedAt: r.revokedAt
    }))
  };
}

export function verifyAgainstStore(key, keysPath) {
  const store = loadKeys(keysPath);
  if (!store.active) return false;
  return verifyKey(key, store.active);
}
