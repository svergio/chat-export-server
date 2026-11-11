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

function randomToken(prefix: string): string {
  return prefix + randomBytes(TOKEN_HEX_BYTES).toString('hex');
}

function hasTokenPrefix(key: unknown, prefix: string): boolean {
  return typeof key === 'string' && key.startsWith(prefix) && TOKEN_BODY_RE.test(key.slice(prefix.length));
}

export function generateMcpToken(): string {
  return randomToken(MCP_TOKEN_PREFIX);
}

export function generateBrowserToken(): string {
  return randomToken(BROWSER_TOKEN_PREFIX);
}

export function isMcpToken(key: unknown): boolean {
  return hasTokenPrefix(key, MCP_TOKEN_PREFIX);
}

export function isBrowserToken(key: unknown): boolean {
  return hasTokenPrefix(key, BROWSER_TOKEN_PREFIX) || hasTokenPrefix(key, LEGACY_BROWSER_TOKEN_PREFIX);
}

export function hashKey(
  key: string,
  salt: string = randomBytes(16).toString('hex')
): { salt: string; hash: string; fingerprint: string } {
  const hash = scryptSync(key, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash, fingerprint: fingerprintOf(key) };
}

export function fingerprintOf(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export function verifyKey(
  key: string | null | undefined,
  record?: { salt?: string; hash?: string } | null
): boolean {
  if (!key || !record?.salt || !record?.hash) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(key, record.salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  const expected = Buffer.from(record.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function chmod600(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* ignore on platforms without chmod */
  }
}

export function writeSecretFile(filePath: string, value: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, value, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
  chmod600(filePath);
  return filePath;
}

function parentDirs(startDir: string): string[] {
  const seen = new Set<string>();
  const dirs: string[] = [];
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

export function findCursorMcpConfig(searchDirs: Array<string | null | undefined> = []): string | null {
  const roots = [
    ...searchDirs.filter((dir): dir is string => Boolean(dir)),
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

export interface McpArtifactOptions {
  filePath?: string;
  searchDirs?: string[];
  tokenPath?: string;
}

export function updateCursorMcpConfig(
  token: string,
  opts: McpArtifactOptions = {}
): { updated: boolean; filePath: string | null } {
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

export function writeMcpTokenArtifacts(home: string, token: string, opts: McpArtifactOptions = {}) {
  const tokenPath = opts.tokenPath || path.join(home, 'mcp-token.txt');
  writeSecretFile(tokenPath, token + '\n');
  if (process.env.CHAT_EXPORT_SKIP_MCP_CONFIG === '1') {
    return { tokenPath, mcpConfig: { updated: false, filePath: null } };
  }
  const mcpConfig = updateCursorMcpConfig(token, {
    ...opts,
    searchDirs: [...(opts.searchDirs || []), process.cwd()].filter(Boolean)
  });
  return { tokenPath, mcpConfig };
}
