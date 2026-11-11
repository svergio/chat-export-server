import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRYPT_KEYLEN = 32;
const TOKEN_HEX_BYTES = 24;
const TOKEN_BODY_RE = /^[a-f0-9]{48}$/;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const MCP_TOKEN_PREFIX = 'cem_';
export const BROWSER_TOKEN_PREFIX = 'ceb_';
export const LEGACY_BROWSER_TOKEN_PREFIX = 'cek_';

function randomToken(prefix) {
  return prefix + randomBytes(TOKEN_HEX_BYTES).toString('hex');
}

function hasTokenPrefix(key, prefix) {
  return typeof key === 'string' && key.startsWith(prefix) && TOKEN_BODY_RE.test(key.slice(prefix.length));
}

export function generateMcpToken() {
  return randomToken(MCP_TOKEN_PREFIX);
}

export function generateBrowserToken() {
  return randomToken(BROWSER_TOKEN_PREFIX);
}

export function isMcpToken(key) {
  return hasTokenPrefix(key, MCP_TOKEN_PREFIX);
}

export function isBrowserToken(key) {
  return hasTokenPrefix(key, BROWSER_TOKEN_PREFIX) || hasTokenPrefix(key, LEGACY_BROWSER_TOKEN_PREFIX);
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

function chmod600(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* ignore on platforms without chmod */
  }
}

export function writeSecretFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, value, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
  chmod600(filePath);
  return filePath;
}

function parentDirs(startDir) {
  const seen = new Set();
  const dirs = [];
  let current = path.resolve(startDir);
  for (;;) {
    if (!seen.has(current)) {
      seen.add(current);
      dirs.push(current);
    }
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return dirs;
}

export function findCursorMcpConfig(searchDirs = []) {
  const roots = [
    ...searchDirs.filter(Boolean),
    process.cwd(),
    MODULE_DIR,
    path.resolve(MODULE_DIR, '..', '..'),
    path.resolve(MODULE_DIR, '..', '..', '..')
  ];
  for (const root of roots) {
    for (const dir of parentDirs(root)) {
      const candidate = path.join(dir, '.cursor', 'mcp.json');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function updateCursorMcpConfig(token, opts = {}) {
  const filePath = opts.filePath || findCursorMcpConfig(opts.searchDirs);
  if (!filePath) return { updated: false, filePath: null };
  const raw = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
  const mcpServers = raw.mcpServers && typeof raw.mcpServers === 'object' ? raw.mcpServers : {};
  const chatExport =
    mcpServers['chat-export'] && typeof mcpServers['chat-export'] === 'object'
      ? mcpServers['chat-export']
      : { url: 'http://127.0.0.1:8765/mcp' };
  const headers = chatExport.headers && typeof chatExport.headers === 'object' ? chatExport.headers : {};
  const next = {
    ...raw,
    mcpServers: {
      ...mcpServers,
      'chat-export': {
        ...chatExport,
        headers: {
          ...headers,
          Authorization: 'Bearer ' + token
        }
      }
    }
  };
  writeSecretFile(filePath, JSON.stringify(next, null, 2) + '\n');
  return { updated: true, filePath };
}

export function writeMcpTokenArtifacts(home, token, opts = {}) {
  const tokenPath = opts.tokenPath || path.join(home, 'mcp-token.txt');
  writeSecretFile(tokenPath, token + '\n');
  const mcpConfig = updateCursorMcpConfig(token, opts);
  return { tokenPath, mcpConfig };
}
