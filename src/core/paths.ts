import os from 'node:os';
import path from 'node:path';
import type { HomePaths } from '../types.js';

export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CHAT_EXPORT_HOME) return path.resolve(env.CHAT_EXPORT_HOME);
  return path.join(os.homedir(), '.chat-export');
}

export function pathsFor(home: string): HomePaths {
  const logsDir = path.join(home, 'logs');
  return {
    home,
    config: path.join(home, 'config.json'),
    keys: path.join(home, 'keys.json'),
    audit: path.join(home, 'audit.log'),
    exportDir: path.join(home, 'exports'),
    dbFile: path.join(home, 'data', 'chat-export.db'),
    logsDir,
    serverLog: path.join(logsDir, 'server.log'),
    alertsLog: path.join(logsDir, 'alerts.log'),
    serverPid: path.join(home, 'server.pid')
  };
}
