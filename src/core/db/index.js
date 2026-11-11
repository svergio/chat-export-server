import { createSqliteAdapter } from './sqlite-adapter.js';
import { createExternalAdapter, redactUrl } from './external-adapter.js';

export { SCHEMA_VERSION, schemaStatements } from './schema.js';
export { SqliteAdapter, SQLITE_PRAGMAS } from './sqlite-adapter.js';
export { createExternalAdapter, redactUrl, REQUIRED_METHODS } from './external-adapter.js';

export const DEFAULT_DATABASE = Object.freeze({ driver: 'sqlite', url: '' });

export function resolveDatabaseConfig(config, env = process.env) {
  const raw = config?.database || {};
  const url = String(env.CHAT_EXPORT_DB_URL || raw.url || '').trim();
  const driver = String(env.CHAT_EXPORT_DB_DRIVER || raw.driver || DEFAULT_DATABASE.driver).trim();
  return { driver, url };
}

export function describeDatabase(config, env) {
  const { driver, url } = resolveDatabaseConfig(config, env);
  if (url) return { driver, url: redactUrl(url) };
  if (driver === 'sqlite') return { driver, file: config.paths.dbFile };
  return { driver };
}

/**
 * sqlite (default) opens paths.dbFile with WAL; a non-empty url or non-sqlite driver switches to the external adapter.
 * @param {{ home?: string, paths: { dbFile: string }, database?: { driver?: string, url?: string } }} config
 * @param {{ file?: string, env?: object, migrate?: boolean }} [opts]
 */
export function openDatabase(config, opts = {}) {
  const { driver, url } = resolveDatabaseConfig(config, opts.env);
  const external = Boolean(url) || (driver !== 'sqlite' && driver !== '');
  const db = external
    ? createExternalAdapter({ driver, url, home: config.home })
    : createSqliteAdapter({ file: opts.file || config.paths.dbFile });
  if (opts.migrate !== false) {
    try {
      db.migrate();
    } catch (err) {
      db.close();
      throw err;
    }
  }
  return db;
}
