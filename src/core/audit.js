import fs from 'node:fs';

/**
 * Append-only JSONL audit log. Never write secrets (Bearer keys).
 * @param {string} auditPath
 * @param {object} event
 */
export function appendAudit(auditPath, event) {
  const entry = {
    ts: new Date().toISOString(),
    ...event
  };
  fs.mkdirSync(dirOf(auditPath), { recursive: true, mode: 0o700 });
  fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
  return entry;
}

function dirOf(p) {
  return p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
}

export function readAuditLines(auditPath, limit = 100) {
  if (!fs.existsSync(auditPath)) return [];
  const text = fs.readFileSync(auditPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => JSON.parse(line));
}
