// Local typings for the plain-JS workspace package; keep in sync with packages/protocol/src.
declare module '@chat-export/protocol' {
  export const PROTOCOL_VERSION: number;
  export const PLATFORMS: readonly [
    'chatgpt',
    'grok',
    'grok-x',
    'copilot',
    'claude',
    'qwen',
    'deepseek',
    'perplexity'
  ];
  export const OPS: readonly string[];
  export const DESTRUCTIVE_OPS: readonly string[];
  export const EXPORT_FORMATS: readonly ['md', 'yaml', 'json', 'html', 'pdf'];
  export const EXPORT_SCHEMAS: readonly ['chat-export/1', 'sharegpt/1'];
  export const DEFAULT_EXPORT_SCHEMA: 'chat-export/1';
  export const ROLES: readonly ['user', 'assistant', 'system'];
  export const CONTENT_RPC_TYPE: string;
  export const LIST_LIMIT_MAX: number;
  export const LIST_LIMIT_DEFAULT: number;

  export const ERROR_CODES: Readonly<{
    PLATFORM_DISABLED: 'PLATFORM_DISABLED';
    NOT_BOUND: 'NOT_BOUND';
    CONFIRM_REQUIRED: 'CONFIRM_REQUIRED';
    DESTRUCTIVE_DISABLED: 'DESTRUCTIVE_DISABLED';
    CREATE_DISABLED: 'CREATE_DISABLED';
    PROJECTS_DISABLED: 'PROJECTS_DISABLED';
    UNAUTHORIZED: 'UNAUTHORIZED';
    TIMEOUT: 'TIMEOUT';
    HOST_ERROR: 'HOST_ERROR';
    NOT_FOUND: 'NOT_FOUND';
    BAD_REQUEST: 'BAD_REQUEST';
    INVALID_ARGS: 'INVALID_ARGS';
    PLATFORM_BUSY: 'PLATFORM_BUSY';
    RATE_LIMIT: 'RATE_LIMIT';
    [extra: string]: string;
  }>;

  export const RETRYABLE_ERROR_CODES: readonly ['PLATFORM_BUSY', 'RATE_LIMIT'];

  export const WS_TYPES: Readonly<{
    HELLO: 'hello';
    WELCOME: 'welcome';
    SETTINGS: 'settings';
    TABS: 'tabs';
    ERROR: 'error';
    RPC: 'rpc';
    RPC_RESULT: 'rpc.result';
  }>;

  export const OP_SCHEMAS: Readonly<Record<string, { args: string; result: string }>>;
  export const schema: { $defs: Record<string, unknown>; [key: string]: unknown };

  export interface ValidationResult {
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
  }

  export class ProtocolError extends Error {
    code: string;
    details?: object;
    constructor(code: string, message: string, details?: object);
    toJSON(): { code: string; message: string; details?: object };
  }

  export function validate(defName: string, value: unknown): ValidationResult;
  export function assertValid<T>(defName: string, value: T): T;
  export function validateRpcRequest(req: unknown): ValidationResult;
  export function validateRpcResponse(res: unknown, op?: string): ValidationResult;
  export function validateOpResult(op: string, data: unknown): ValidationResult;
  export function rpcOk(id: string, data: unknown): { id: string; ok: true; data: unknown };
  export function rpcError(
    id: string,
    code: string,
    message: string,
    details?: object
  ): { id: string; ok: false; error: { code: string; message: string; details?: object } };
}
