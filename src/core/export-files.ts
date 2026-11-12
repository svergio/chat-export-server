import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';

const INLINE_TEXT_MAX = 64 * 1024;

export interface IncomingExportFile {
  name: string;
  mime: string;
  text?: string;
  b64?: string;
}

export interface WrittenExportFile {
  name: string;
  mime: string;
  path: string;
  text?: string;
}

// Write ExportFile[] under exportDir and return paths + optional inline text.
export function writeExportFiles(
  exportDir: string,
  meta: { platform: string; chatId?: string },
  files: IncomingExportFile[] | null | undefined
): { dir: string; files: WrittenExportFile[] } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safePlatform = sanitize(meta.platform || 'chat');
  const safeChat = sanitize(meta.chatId || 'current') || 'current';
  const dir = path.join(exportDir, safePlatform, safeChat, stamp);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const written: WrittenExportFile[] = [];
  for (const file of files || []) {
    const name = sanitizeFileName(file.name) || 'export.bin';
    const dest = path.join(dir, name);
    if (typeof file.text === 'string') {
      fs.writeFileSync(dest, file.text, 'utf8');
    } else if (typeof file.b64 === 'string') {
      fs.writeFileSync(dest, Buffer.from(file.b64, 'base64'));
    } else {
      continue;
    }
    const entry: WrittenExportFile = {
      name,
      mime: file.mime,
      path: dest
    };
    if (typeof file.text === 'string' && file.text.length <= INLINE_TEXT_MAX) {
      entry.text = file.text;
    }
    written.push(entry);
  }
  return { dir, files: written };
}

function stripDotSegments(s: string): string {
  return s.replace(/^\.+$/, '_');
}

function sanitize(s: unknown): string {
  return stripDotSegments(String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80));
}

function sanitizeFileName(name: unknown): string {
  const normalized = String(name || '').replace(/\\/g, '/');
  const base = path.basename(normalized);
  let cleaned = stripDotSegments(base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 180));
  cleaned = cleaned.replace(/\.\.+/g, '_');
  return cleaned;
}

const ALLOWED_HOME_DOT_DIRS = new Set(['.chat-export']);

function realpathOfExistingAncestor(target: string): string {
  let current = target;
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...tail.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function relativeInside(root: string, target: string): string | null {
  const rel = path.relative(realpathOfExistingAncestor(path.resolve(root)), target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel;
}

export function resolveExportOutDir(outDir: string, homedir = os.homedir(), extraRoots: string[] = []): string {
  let p = String(outDir || '').trim();
  if (!p) throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'outDir required');
  if (p.startsWith('~/')) p = path.join(homedir, p.slice(2));
  else if (p === '~') p = homedir;
  if (!path.isAbsolute(p)) {
    throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'outDir must be an absolute path under HOME');
  }
  const resolved = realpathOfExistingAncestor(path.resolve(p));
  for (const root of extraRoots) {
    if (root && relativeInside(root, resolved) !== null) return resolved;
  }
  const rel = relativeInside(homedir, resolved);
  if (rel === null) {
    throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'outDir must be inside HOME');
  }
  const first = rel.split(path.sep)[0];
  if (first.startsWith('.') && !ALLOWED_HOME_DOT_DIRS.has(first)) {
    throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'outDir must not be inside a hidden HOME directory');
  }
  return resolved;
}
