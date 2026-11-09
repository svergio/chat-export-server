import os from 'node:os';
import path from 'node:path';

export function resolveHome(env = process.env) {
  if (env.CHAT_EXPORT_HOME) return path.resolve(env.CHAT_EXPORT_HOME);
  return path.join(os.homedir(), '.chat-export');
}

export function pathsFor(home) {
  return {
    home,
    config: path.join(home, 'config.json'),
    keys: path.join(home, 'keys.json'),
    audit: path.join(home, 'audit.log'),
    exportDir: path.join(home, 'exports')
  };
}
