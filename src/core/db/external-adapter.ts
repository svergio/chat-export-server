import path from 'node:path';
import { createRequire } from 'node:module';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { schemaStatements } from './schema.js';
import type { DatabaseAdapter, Row, SqlParam } from '../../types.js';

export const REQUIRED_METHODS = Object.freeze(['exec', 'run', 'get', 'all', 'transaction', 'migrate', 'close']);

const BUILTIN_DRIVER_MODULES: Readonly<Record<string, string>> = Object.freeze({
  postgres: 'chat-export-db-postgres',
  postgresql: 'chat-export-db-postgres'
});

const require = createRequire(import.meta.url);

export function redactUrl(url: unknown): string {
  try {
    const u = new URL(String(url));
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:\/\/([^:@/]+):[^@/]*@/, '://$1:***@');
  }
}

function inferDriver(driver: string | undefined, url: string | undefined): string | null {
  if (driver && driver !== 'sqlite' && driver !== 'external') return driver;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url || '')?.[1]?.toLowerCase();
  return scheme || null;
}

function resolveModuleId(driver: string, home?: string): string {
  if (BUILTIN_DRIVER_MODULES[driver]) return BUILTIN_DRIVER_MODULES[driver];
  if (driver.startsWith('.') || path.isAbsolute(driver)) return path.resolve(home || process.cwd(), driver);
  return driver;
}

function hostError(message: string, details?: object): ProtocolError {
  return new ProtocolError(ERROR_CODES.HOST_ERROR, message, details);
}

function loadDriverModule(moduleId: string, driver: string): any {
  try {
    return require(moduleId);
  } catch (err: any) {
    throw hostError(`external database driver "${driver}" could not be loaded (${moduleId}): ${err.message}`, {
      driver,
      module: moduleId
    });
  }
}

export interface ExternalAdapter extends DatabaseAdapter {
  inner: any;
}

// Wraps a synchronous driver module exporting createAdapter({ url, driver, schemaStatements })
// so the rest of the server sees the same interface as SqliteAdapter.
export function createExternalAdapter(opts: { driver?: string; url?: string; home?: string }): ExternalAdapter {
  const { url = '', home } = opts;
  const driver = inferDriver(opts.driver, url);
  if (!driver) {
    throw hostError('database.url is set but no driver could be inferred; set database.driver to a module path or package', {
      url: url ? redactUrl(url) : ''
    });
  }
  const moduleId = resolveModuleId(driver, home);
  const mod = loadDriverModule(moduleId, driver);
  const factory = mod.createAdapter || mod.default?.createAdapter || (typeof mod === 'function' ? mod : null);
  if (typeof factory !== 'function') {
    throw hostError(`external database driver "${driver}" must export createAdapter(options)`, { module: moduleId });
  }
  const inner = factory({ url, driver, schemaStatements });
  const missing = REQUIRED_METHODS.filter((m) => typeof inner?.[m] !== 'function');
  if (missing.length) {
    throw hostError(`external database driver "${driver}" is missing methods: ${missing.join(', ')}`, {
      module: moduleId,
      missing
    });
  }
  return {
    driver,
    rowOrder: inner.rowOrder || 'id',
    inner,
    describe: () => ({ driver, url: redactUrl(url) }),
    exec: (sql: string) => inner.exec(sql),
    run: (sql: string, params: SqlParam[] = []) => inner.run(sql, params),
    get: (sql: string, params: SqlParam[] = []): Row | null => inner.get(sql, params) ?? null,
    all: (sql: string, params: SqlParam[] = []): Row[] => inner.all(sql, params),
    transaction: <T>(fn: (db: DatabaseAdapter) => T): T => inner.transaction(fn),
    migrate: () => inner.migrate(),
    close: () => inner.close()
  };
}
