import fs from 'node:fs';
import path from 'node:path';
import type { RegisteredBrowser } from '../types.js';

export function loadEnvFile(): void {
  const spec = process.env.CHAT_EXPORT_ENV_FILE;
  const candidates: string[] = [];
  if (spec && spec.trim()) {
    candidates.push(path.resolve(spec.trim()));
  } else {
    candidates.push(path.join(process.cwd(), '.env'));
  }
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    if (typeof (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function') {
      (process as NodeJS.Process & { loadEnvFile: (path?: string) => void }).loadEnvFile(file);
      return;
    }
    parseDotEnvIntoProcess(fs.readFileSync(file, 'utf8'));
    return;
  }
}

function parseDotEnvIntoProcess(raw: string): void {
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function envString(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v === '') return undefined;
  const t = v.trim();
  return t || undefined;
}

export function envBool(key: string): boolean | undefined {
  const v = envString(key);
  if (v === undefined) return undefined;
  const low = v.toLowerCase();
  if (low === '1' || low === 'true' || low === 'yes') return true;
  if (low === '0' || low === 'false' || low === 'no') return false;
  return undefined;
}

export function envInt(key: string): number | undefined {
  const v = envString(key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.floor(n);
}

export function parseBrowserTokensEnv(raw: string | undefined): RegisteredBrowser[] {
  if (!raw || !String(raw).trim()) return [];
  const out: RegisteredBrowser[] = [];
  const parts = String(raw).split(',');
  for (const part of parts) {
    const chunk = part.trim();
    if (!chunk) continue;
    const segs = chunk.split(':');
    const browserId = (segs[0] || '').trim();
    const key = (segs[1] || '').trim();
    const browserLabel = (segs[2] || '').trim() || browserId;
    if (!browserId || !key) continue;
    out.push({
      browserId,
      key,
      browserLabel,
      allowCreate: true,
      allowDestructive: false,
      allowProjects: true
    });
  }
  return out;
}
