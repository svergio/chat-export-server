import fs from 'node:fs';
import { redactSecrets } from './logger.js';

// Append-only JSONL audit log. Never write secrets (Bearer keys).
export function appendAudit(auditPath: string, event: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    ...redactSecrets(event)
  };
  fs.mkdirSync(dirOf(auditPath), { recursive: true, mode: 0o700 });
  fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
  return entry;
}

function dirOf(p: string): string {
  return p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
}

export function readAuditLines(auditPath: string, limit = 100): any[] {
  if (!fs.existsSync(auditPath)) return [];
  const text = fs.readFileSync(auditPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => JSON.parse(line));
}
