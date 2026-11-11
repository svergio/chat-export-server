import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION, schemaStatements } from './schema.js';

export const SQLITE_PRAGMAS = Object.freeze([
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000'
]);

function normalizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export class SqliteAdapter {
  /**
   * @param {{ file: string }} opts file path or ':memory:'
   */
  constructor(opts) {
    this.driver = 'sqlite';
    this.file = opts.file;
    this.rowOrder = 'rowid';
    this.depth = 0;
    this.closed = false;
    /** @type {Map<string, import('node:sqlite').StatementSync>} */
    this.statements = new Map();
    if (this.file !== ':memory:') {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(this.file);
    for (const pragma of SQLITE_PRAGMAS) this.db.exec(pragma);
    if (this.file !== ':memory:') {
      try {
        fs.chmodSync(this.file, 0o600);
      } catch {
        /* best effort on exotic filesystems */
      }
    }
  }

  describe() {
    return { driver: this.driver, file: this.file };
  }

  #prepare(sql) {
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  exec(sql) {
    this.db.exec(sql);
  }

  run(sql, params = []) {
    const info = this.#prepare(sql).run(...params.map(normalizeParam));
    return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid };
  }

  get(sql, params = []) {
    return this.#prepare(sql).get(...params.map(normalizeParam)) || null;
  }

  all(sql, params = []) {
    return this.#prepare(sql).all(...params.map(normalizeParam));
  }

  /** Nested calls become savepoints so callers can compose transactions freely. */
  transaction(fn) {
    const nested = this.depth > 0;
    const name = 'sp_' + this.depth;
    this.db.exec(nested ? 'SAVEPOINT ' + name : 'BEGIN IMMEDIATE');
    this.depth += 1;
    try {
      const result = fn(this);
      this.depth -= 1;
      this.db.exec(nested ? 'RELEASE ' + name : 'COMMIT');
      return result;
    } catch (err) {
      this.depth -= 1;
      this.db.exec(nested ? 'ROLLBACK TO ' + name + '; RELEASE ' + name : 'ROLLBACK');
      throw err;
    }
  }

  migrate() {
    this.transaction(() => {
      for (const stmt of schemaStatements({ fts: true })) this.db.exec(stmt);
      this.db.exec('PRAGMA user_version = ' + SCHEMA_VERSION);
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.statements.clear();
    this.db.close();
  }
}

export function createSqliteAdapter(opts) {
  return new SqliteAdapter(opts);
}
