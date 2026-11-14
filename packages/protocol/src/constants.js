export const PROTOCOL_VERSION = 1;

/** @typedef {'chatgpt' | 'grok' | 'grok-x' | 'copilot' | 'claude' | 'qwen' | 'deepseek' | 'perplexity' | 'kimi' | 'zai' | 'minimax'} Platform */
export const PLATFORMS = Object.freeze([
  'chatgpt',
  'grok',
  'grok-x',
  'copilot',
  'claude',
  'qwen',
  'deepseek',
  'perplexity',
  'kimi',
  'zai',
  'minimax'
]);

/** @typedef {'chats.list' | 'chats.get' | 'chats.export' | 'chats.create' | 'chats.delete' | 'chats.send' |
 *   'platform.capabilities' | 'platform.host_state' | 'tabs.ensure' |
 *   'containers.list' | 'containers.chats' | 'containers.create' | 'containers.delete' | 'containers.move_chat'} Op */
export const OPS = Object.freeze([
  'chats.list',
  'chats.get',
  'chats.export',
  'chats.create',
  'chats.delete',
  'chats.send',
  'platform.capabilities',
  'platform.host_state',
  'tabs.ensure',
  'containers.list',
  'containers.chats',
  'containers.create',
  'containers.delete',
  'containers.move_chat'
]);

export const DESTRUCTIVE_OPS = Object.freeze(['chats.delete', 'containers.delete']);

/** @typedef {'md' | 'yaml' | 'json' | 'html' | 'pdf'} ExportFormat */
export const EXPORT_FORMATS = Object.freeze(['md', 'yaml', 'json', 'html', 'pdf']);

/** @typedef {'chat-export/1' | 'sharegpt/1'} ExportSchema */
/** Export text layout schemas (`name/version`). Default: chat-export/1 */
export const EXPORT_SCHEMAS = Object.freeze(['chat-export/1', 'sharegpt/1']);
export const DEFAULT_EXPORT_SCHEMA = 'chat-export/1';

export const ROLES = Object.freeze(['user', 'assistant', 'system']);

/**
 * @typedef {'PLATFORM_DISABLED' | 'NOT_BOUND' | 'CONFIRM_REQUIRED' | 'DESTRUCTIVE_DISABLED' |
 *   'CREATE_DISABLED' | 'PROJECTS_DISABLED' | 'UNAUTHORIZED' | 'TIMEOUT' |
 *   'HOST_ERROR' | 'NOT_FOUND' | 'BAD_REQUEST' | 'INVALID_ARGS' | 'PLATFORM_BUSY' | 'RATE_LIMIT' | 'CAPTCHA' |
 *   'OPTION_NOT_FOUND' | 'OPTION_LOCKED' | 'ATTACH_UNSUPPORTED' | 'FILE_NOT_ALLOWED' | 'FILE_TOO_LARGE' | 'ATTACH_TIMEOUT'} ErrorCode
 */
export const ERROR_CODES = Object.freeze({
  PLATFORM_DISABLED: 'PLATFORM_DISABLED',
  NOT_BOUND: 'NOT_BOUND',
  CONFIRM_REQUIRED: 'CONFIRM_REQUIRED',
  DESTRUCTIVE_DISABLED: 'DESTRUCTIVE_DISABLED',
  CREATE_DISABLED: 'CREATE_DISABLED',
  PROJECTS_DISABLED: 'PROJECTS_DISABLED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TIMEOUT: 'TIMEOUT',
  HOST_ERROR: 'HOST_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_ARGS: 'INVALID_ARGS',
  PLATFORM_BUSY: 'PLATFORM_BUSY',
  RATE_LIMIT: 'RATE_LIMIT',
  CAPTCHA: 'CAPTCHA',
  OPTION_NOT_FOUND: 'OPTION_NOT_FOUND',
  OPTION_LOCKED: 'OPTION_LOCKED',
  ATTACH_UNSUPPORTED: 'ATTACH_UNSUPPORTED',
  FILE_NOT_ALLOWED: 'FILE_NOT_ALLOWED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  ATTACH_TIMEOUT: 'ATTACH_TIMEOUT'
});

export const RETRYABLE_ERROR_CODES = Object.freeze(['PLATFORM_BUSY', 'RATE_LIMIT']);

export const WS_TYPES = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  SETTINGS: 'settings',
  TABS: 'tabs',
  ERROR: 'error',
  RPC: 'rpc',
  RPC_RESULT: 'rpc.result'
});

export const CONTENT_RPC_TYPE = 'chat-export-rpc';

export const LIST_LIMIT_MAX = 100;
export const LIST_LIMIT_DEFAULT = 20;
