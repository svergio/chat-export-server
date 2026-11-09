import fs from 'node:fs';
import path from 'node:path';
import { PLATFORMS } from '@chat-export/protocol';
import { pathsFor, resolveHome } from './paths.js';

export const DEFAULT_PORT = 8765;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_RPC_TIMEOUT_MS = 60_000;

export function defaultConfig(home) {
  const p = pathsFor(home);
  return {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    exportDir: p.exportDir,
    rpcTimeoutMs: DEFAULT_RPC_TIMEOUT_MS,
    settings: {
      platformsEnabled: [...PLATFORMS],
      allowDestructive: false
    }
  };
}

export function loadConfig(home = resolveHome()) {
  const p = pathsFor(home);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const defaults = defaultConfig(home);
  if (!fs.existsSync(p.config)) {
    saveConfig(home, defaults);
    return { ...defaults, home, paths: p };
  }
  const raw = JSON.parse(fs.readFileSync(p.config, 'utf8'));
  const merged = {
    host: raw.host === undefined ? defaults.host : raw.host,
    port: raw.port === undefined ? defaults.port : Number(raw.port),
    exportDir: raw.exportDir || defaults.exportDir,
    rpcTimeoutMs: raw.rpcTimeoutMs === undefined ? defaults.rpcTimeoutMs : Number(raw.rpcTimeoutMs),
    settings: {
      platformsEnabled: Array.isArray(raw.settings?.platformsEnabled)
        ? raw.settings.platformsEnabled.filter((x) => PLATFORMS.includes(x))
        : defaults.settings.platformsEnabled,
      allowDestructive: Boolean(raw.settings?.allowDestructive)
    }
  };
  if (merged.host !== DEFAULT_HOST) {
    merged.host = DEFAULT_HOST;
  }
  fs.mkdirSync(merged.exportDir, { recursive: true, mode: 0o700 });
  return { ...merged, home, paths: p };
}

export function saveConfig(home, config) {
  const p = pathsFor(home);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const out = {
    host: DEFAULT_HOST,
    port: config.port ?? DEFAULT_PORT,
    exportDir: config.exportDir || p.exportDir,
    rpcTimeoutMs: config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
    settings: {
      platformsEnabled: config.settings?.platformsEnabled || [...PLATFORMS],
      allowDestructive: Boolean(config.settings?.allowDestructive)
    }
  };
  const tmp = p.config + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, p.config);
  return out;
}

export function updateSettings(home, patch) {
  const cfg = loadConfig(home);
  if (patch.platformsEnabled) {
    cfg.settings.platformsEnabled = patch.platformsEnabled.filter((x) => PLATFORMS.includes(x));
  }
  if (patch.allowDestructive !== undefined) {
    cfg.settings.allowDestructive = Boolean(patch.allowDestructive);
  }
  saveConfig(home, cfg);
  return loadConfig(home);
}

export function resolveExportDir(cfg) {
  return path.resolve(cfg.exportDir);
}
