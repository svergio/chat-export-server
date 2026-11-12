export const SCHEMA_VERSION = 1;

export const DEFAULT_AUTOINCREMENT_PK = 'INTEGER PRIMARY KEY AUTOINCREMENT';

export interface SchemaColumn {
  table: string;
  column: string;
  type: string;
}

// Columns added after a table first shipped: CREATE TABLE IF NOT EXISTS skips existing tables,
// so older DBs need ALTER TABLE before anything (indexes) references them.
export const SCHEMA_COLUMNS: readonly SchemaColumn[] = Object.freeze([
  { table: 'jobs', column: 'request_id', type: 'TEXT' }
]);

export const SCHEMA_INDEXES: readonly string[] = Object.freeze([
  'CREATE INDEX IF NOT EXISTS idx_jobs_request_id ON jobs(request_id, created_at)'
]);

export interface SchemaOptions {
  metricsIdColumn?: string;
  fts?: boolean;
}

export function schemaStatements({
  metricsIdColumn = DEFAULT_AUTOINCREMENT_PK,
  fts = true
}: SchemaOptions = {}): string[] {
  const statements = [
    `CREATE TABLE IF NOT EXISTS mcp_tokens (
      id TEXT PRIMARY KEY,
      label TEXT,
      salt TEXT,
      hash TEXT,
      fingerprint TEXT,
      created_at TEXT,
      last_used_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS browsers (
      browser_id TEXT PRIMARY KEY,
      label TEXT,
      salt TEXT,
      hash TEXT,
      fingerprint TEXT,
      host_ip TEXT,
      permissions_json TEXT,
      tabs_json TEXT,
      status TEXT,
      connected_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS browser_revoked_tokens (
      id TEXT PRIMARY KEY,
      browser_id TEXT NOT NULL,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      revoked_at TEXT NOT NULL,
      reason TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_browser_revoked_browser ON browser_revoked_tokens(browser_id, revoked_at)',
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      lane_browser_id TEXT,
      kind TEXT,
      platform TEXT,
      status TEXT,
      input_json TEXT,
      progress_json TEXT,
      result_json TEXT,
      error_json TEXT,
      attempts INTEGER DEFAULT 0,
      cancel_requested INTEGER DEFAULT 0,
      retry_at INTEGER,
      chat_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      request_id TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_jobs_lane_status ON jobs(lane_browser_id, status, created_at)',
    `CREATE TABLE IF NOT EXISTS cached_chats (
      cache_id TEXT PRIMARY KEY,
      browser_id TEXT,
      platform TEXT,
      chat_id TEXT,
      container_id TEXT,
      title TEXT,
      model TEXT,
      total_turns INTEGER,
      total_chars INTEGER,
      meta_json TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS cached_chat_blocks (
      cache_id TEXT,
      turn_index INTEGER,
      block_id TEXT,
      role TEXT,
      content TEXT,
      raw_json TEXT,
      revision INTEGER DEFAULT 1,
      updated_at TEXT,
      PRIMARY KEY (cache_id, turn_index)
    )`,
    `CREATE TABLE IF NOT EXISTS metrics_log (
      id ${metricsIdColumn},
      ts TEXT,
      level TEXT,
      component TEXT,
      tool TEXT,
      browser_id TEXT,
      platform TEXT,
      duration_ms INTEGER,
      ok INTEGER,
      code TEXT,
      message TEXT,
      detail_json TEXT
    )`
  ];
  if (fts) {
    statements.push(
      'CREATE VIRTUAL TABLE IF NOT EXISTS cached_chat_fts USING fts5(cache_id, turn_index, role, content)'
    );
  }
  return statements;
}
