import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { resolveHome } from './paths.js';

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml'
};

export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface FileRef {
  path: string;
  name?: string;
  mime?: string;
}

export interface WireFile {
  name: string;
  mime: string;
  size: number;
  b64: string;
}

export interface AttachmentsConfig {
  allowDirs?: string[];
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

export function defaultAttachmentDirs(home?: string): string[] {
  const h = home || resolveHome();
  return [path.join(h, 'uploads'), path.join(os.homedir(), 'Downloads')];
}

export function defaultAttachmentsConfig(home?: string): Required<AttachmentsConfig> {
  return {
    allowDirs: defaultAttachmentDirs(home),
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES
  };
}

function expandPath(input: unknown, home: string): string {
  let p = String(input || '').trim();
  if (!p) throw new ProtocolError(ERROR_CODES.FILE_NOT_ALLOWED, 'empty path');
  if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));
  else if (p === '~') p = os.homedir();
  if (!path.isAbsolute(p)) p = path.resolve(home || process.cwd(), p);
  return p;
}

function mimeFromExt(filePath: string, override?: string): string {
  if (override) return override;
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function resolveAllowRoots(allowDirs: string[] | undefined, home: string): string[] {
  const roots: string[] = [];
  for (const dir of allowDirs || []) {
    const expanded = expandPath(dir, home);
    try {
      const st = fs.lstatSync(expanded);
      if (!st.isDirectory()) continue;
      roots.push(fs.realpathSync(expanded));
    } catch {
      /* skip missing allow roots */
    }
  }
  return roots;
}

function isUnderRoot(realFile: string, root: string): boolean {
  if (realFile === root) return true;
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return realFile.startsWith(prefix);
}

function assertAllowedRealpath(realFile: string, roots: string[]): string {
  for (const root of roots) {
    if (isUnderRoot(realFile, root)) return root;
  }
  throw new ProtocolError(ERROR_CODES.FILE_NOT_ALLOWED, 'path not in allowDirs: ' + realFile);
}

export function loadFiles(
  refs: FileRef[] | null | undefined,
  config: { home?: string; attachments?: AttachmentsConfig } = {}
): WireFile[] {
  if (!refs?.length) return [];
  const home = config.home || resolveHome();
  const att = { ...defaultAttachmentsConfig(home), ...(config.attachments || {}) };
  const maxFile = Number(att.maxFileBytes) || DEFAULT_MAX_FILE_BYTES;
  const maxTotal = Number(att.maxTotalBytes) || DEFAULT_MAX_TOTAL_BYTES;
  const roots = resolveAllowRoots(att.allowDirs, home);
  if (!roots.length) {
    throw new ProtocolError(ERROR_CODES.FILE_NOT_ALLOWED, 'no attachment allowDirs configured');
  }

  const out: WireFile[] = [];
  let total = 0;

  for (const ref of refs) {
    const requested = expandPath(ref.path, home);
    let realFile: string;
    try {
      realFile = fs.realpathSync(requested);
    } catch {
      throw new ProtocolError(ERROR_CODES.FILE_NOT_ALLOWED, 'cannot read path: ' + ref.path);
    }
    assertAllowedRealpath(realFile, roots);

    let st: fs.Stats;
    try {
      st = fs.statSync(realFile);
    } catch {
      throw new ProtocolError(ERROR_CODES.FILE_NOT_ALLOWED, 'cannot stat: ' + ref.path);
    }
    if (!st.isFile()) {
      throw new ProtocolError(ERROR_CODES.FILE_NOT_ALLOWED, 'not a regular file: ' + ref.path);
    }
    if (st.size > maxFile) {
      throw new ProtocolError(ERROR_CODES.FILE_TOO_LARGE, 'file exceeds maxFileBytes: ' + ref.path, {
        size: st.size,
        maxFileBytes: maxFile
      });
    }
    total += st.size;
    if (total > maxTotal) {
      throw new ProtocolError(ERROR_CODES.FILE_TOO_LARGE, 'total attachments exceed maxTotalBytes', {
        total,
        maxTotalBytes: maxTotal
      });
    }

    const name = ref.name || path.basename(realFile);
    const mime = mimeFromExt(realFile, ref.mime);
    const b64 = fs.readFileSync(realFile).toString('base64');
    out.push({ name, mime, size: st.size, b64 });
  }

  return out;
}

export const EXPORT_RPC_TIMEOUT_MS = 120_000;
export const EXPORT_HEAVY_RPC_TIMEOUT_MS = 180_000;

export function rpcTimeoutForArgs(baseMs: number, args: Record<string, any> | undefined, op: string): number {
  const base = Number(baseMs) || 60_000;
  if (op === 'chats.export') {
    const formats = Array.isArray(args?.formats) ? args.formats : [];
    const heavy = formats.includes('pdf') || formats.length >= 3 || args?.branch === 'all';
    return Math.max(base, heavy ? EXPORT_HEAVY_RPC_TIMEOUT_MS : EXPORT_RPC_TIMEOUT_MS);
  }
  let bytes = 0;
  if (args?.files) {
    for (const f of args.files) bytes += Number(f.size) || 0;
  }
  if (!bytes) return base;
  const extra = Math.ceil(bytes / (256 * 1024)) * 5000;
  return Math.min(Math.max(base + extra, base), 300_000);
}
