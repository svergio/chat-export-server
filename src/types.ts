import type { PLATFORMS } from '@chat-export/protocol';

export type Platform = (typeof PLATFORMS)[number];

export interface HomePaths {
  home: string;
  config: string;
  keys: string;
  audit: string;
  exportDir: string;
  dbFile: string;
  logsDir: string;
  serverLog: string;
  alertsLog: string;
}

export interface DatabaseConfig {
  driver: string;
  url: string;
}

export interface LoggingConfig {
  filePath: string;
  alertsFilePath: string;
  level: string;
  maxBytes: number;
}

export interface DashboardConfig {
  enabled: boolean;
  username: string;
  password: string;
}

export interface RegisteredBrowser {
  browserId: string;
  key: string;
  browserLabel: string;
  allowCreate: boolean;
  allowDestructive: boolean;
  allowProjects: boolean;
}

export interface ServerSettings {
  platformsEnabled: string[];
  allowDestructive: boolean;
}

export interface ChatExportConfig {
  host: string;
  port: number;
  exportDir: string;
  rpcTimeoutMs: number;
  database: DatabaseConfig;
  logging: LoggingConfig;
  registeredBrowsers: RegisteredBrowser[];
  dashboard: DashboardConfig;
  settings: ServerSettings;
}

export interface LoadedConfig extends ChatExportConfig {
  home: string;
  paths: HomePaths;
}

export type SqlParam = string | number | bigint | boolean | null | undefined | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export type Row = Record<string, any>;

export interface DatabaseAdapter {
  driver: string;
  rowOrder: string;
  describe(): Record<string, unknown>;
  exec(sql: string): void;
  run(sql: string, params?: SqlParam[]): RunResult;
  get(sql: string, params?: SqlParam[]): Row | null;
  all(sql: string, params?: SqlParam[]): Row[];
  transaction<T>(fn: (db: DatabaseAdapter) => T): T;
  migrate(): void;
  close(): void;
}

export interface LogEvent {
  component?: string;
  message?: string;
  code?: string | null;
  tool?: string | null;
  platform?: string | null;
  browser_id?: string | null;
  browserId?: string;
  duration_ms?: number;
  ok?: boolean;
  level?: string;
  detail?: unknown;
  detail_json?: unknown;
  details?: unknown;
  [key: string]: unknown;
}
