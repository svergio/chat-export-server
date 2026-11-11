import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLATFORMS } from '@chat-export/protocol';
import { pathsFor, resolveHome } from './paths.js';

export const DEFAULT_PORT = 8765;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_RPC_TIMEOUT_MS = 60_000;

export function normalizeDatabase(raw) {
  return {
    driver: typeof raw?.driver === 'string' && raw.driver.trim() ? raw.driver.trim() : 'sqlite',
    url: typeof raw?.url === 'string' ? raw.url.trim() : ''
  };
}

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

export function normalizeLogging(raw, paths) {
  const level = typeof raw?.level === 'string' && LOG_LEVELS.has(raw.level) ? raw.level : 'info';
  const maxBytes =
    raw?.maxBytes === undefined || raw?.maxBytes === null || Number.isNaN(Number(raw.maxBytes))
      ? 10_485_760
      : Math.max(1024, Number(raw.maxBytes));
  const filePath =
    typeof raw?.filePath === 'string' && raw.filePath.trim()
      ? resolveHomePath(raw.filePath.trim())
      : paths.serverLog;
  const alertsFilePath =
    typeof raw?.alertsFilePath === 'string' && raw.alertsFilePath.trim()
      ? resolveHomePath(raw.alertsFilePath.trim())
      : paths.alertsLog;
  return { filePath, alertsFilePath, level, maxBytes };
}

function resolveHomePath(spec) {
  if (spec.startsWith('~/')) {
    return path.join(os.homedir(), spec.slice(2));
  }
  return path.resolve(spec);
}

export function normalizeDashboard(raw) {
  return {
    enabled: raw?.enabled !== false,
    username:
      typeof raw?.username === 'string' && raw.username.trim() ? raw.username.trim() : 'admin',
    password: typeof raw?.password === 'string' ? raw.password : 'changeme'
  };
}

export function normalizeRegisteredBrowsers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const browserId = typeof item.browserId === 'string' ? item.browserId.trim() : '';
      const key = typeof item.key === 'string' ? item.key.trim() : '';
      if (!browserId || !key) return null;
      const browserLabel =
        typeof item.browserLabel === 'string' && item.browserLabel.trim()
          ? item.browserLabel.trim()
          : browserId;
      return {
        browserId,
        key,
        browserLabel,
        allowCreate: item.allowCreate === false ? false : true,
        allowDestructive: Boolean(item.allowDestructive),
        allowProjects: item.allowProjects === false ? false : true
      };
    })
    .filter(Boolean);
}

export function defaultConfig(home) {
  const p = pathsFor(home);
  return {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    exportDir: p.exportDir,
    rpcTimeoutMs: DEFAULT_RPC_TIMEOUT_MS,
    database: normalizeDatabase(),
    logging: normalizeLogging({}, p),
    registeredBrowsers: [],
    dashboard: normalizeDashboard(),
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
    database: normalizeDatabase(raw.database),
    logging: normalizeLogging(raw.logging, p),
    registeredBrowsers: normalizeRegisteredBrowsers(raw.registeredBrowsers),
    dashboard: normalizeDashboard(raw.dashboard),
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
  fs.mkdirSync(p.logsDir, { recursive: true, mode: 0o700 });
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
    database: normalizeDatabase(config.database),
    logging: normalizeLogging(config.logging, p),
    registeredBrowsers: normalizeRegisteredBrowsers(config.registeredBrowsers),
    dashboard: normalizeDashboard(config.dashboard),
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
