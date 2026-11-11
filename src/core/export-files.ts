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

function sanitize(s: unknown): string {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

function sanitizeFileName(name: unknown): string {
  const base = path.basename(String(name || ''));
  return base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 180);
}

export function resolveExportOutDir(outDir: string, homedir = os.homedir()): string {
  let p = String(outDir || '').trim();
  if (!p) throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'outDir required');
  if (p.startsWith('~/')) p = path.join(homedir, p.slice(2));
  else if (p === '~') p = homedir;
  if (!path.isAbsolute(p)) p = path.resolve(p);
  return p;
}
