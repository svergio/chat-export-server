import fs from 'node:fs';
import path from 'node:path';

const INLINE_TEXT_MAX = 64 * 1024;

/**
 * Write ExportFile[] under exportDir and return paths + optional inline text.
 * @param {string} exportDir
 * @param {{ platform: string, chatId?: string }} meta
 * @param {import('@chat-export/protocol').ExportFile[] | Array<{name:string,mime:string,text?:string,b64?:string}>} files
 */
export function writeExportFiles(exportDir, meta, files) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safePlatform = sanitize(meta.platform || 'chat');
  const safeChat = sanitize(meta.chatId || 'current') || 'current';
  const dir = path.join(exportDir, safePlatform, safeChat, stamp);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const written = [];
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
    const entry = {
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

function sanitize(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || ''));
  return base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 180);
}
