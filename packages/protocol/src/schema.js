import {
  PROTOCOL_VERSION,
  PLATFORMS,
  OPS,
  EXPORT_FORMATS,
  ROLES,
  ERROR_CODES,
  WS_TYPES,
  LIST_LIMIT_MAX
} from './constants.js';

const ref = (name) => ({ $ref: '#/$defs/' + name });
const str = { type: 'string' };
const nonEmpty = { type: 'string', minLength: 1 };
const isoOrNull = { type: ['string', 'null'], format: 'date-time' };

function object(properties, required, extra) {
  return Object.assign(
    { type: 'object', properties, required: required || [], additionalProperties: false },
    extra || {}
  );
}

/** @typedef {{ text: string, href: string }} Link */
/** @typedef {{ title: string, url: string }} Source */
/**
 * @typedef {{ role: 'user' | 'assistant' | 'system', roleTag: string, text: string,
 *   links?: Link[], sources?: Source[] }} Message
 */
/**
 * @typedef {{ platform: import('./constants.js').Platform, chatId: string, title: string,
 *   url: string, updatedAt: string | null, createdAt?: string | null }} Chat
 */
/**
 * @typedef {{ platform: import('./constants.js').Platform, url: string, title: string, chatId: string,
 *   model: string, userName: string, userHandle: string, userEmail: string, messages: Message[] }} ExportPayload
 */
/** @typedef {{ name: string, mime: string, text: string } | { name: string, mime: string, b64: string }} ExportFile */
/** @typedef {{ code: import('./constants.js').ErrorCode, message: string, details?: object }} RpcError */
/**
 * @typedef {{ type?: string, id: string, op: import('./constants.js').Op,
 *   platform: import('./constants.js').Platform, args: object }} RpcRequest
 */
/**
 * @typedef {{ type?: string, id: string, ok: true, data: any } |
 *   { type?: string, id: string, ok: false, error: RpcError }} RpcResponse
 */
/** @typedef {{ cursor?: string | null, limit?: number, query?: string, includeProjectChats?: boolean, containerId?: string }} ChatsListArgs */
/** @typedef {{ items: Chat[], nextCursor: string | null }} ChatsListResult */
/** @typedef {{ platform: import('./constants.js').Platform, containerId: string, containerType: 'project', title: string,
 *   url?: string, chatCount?: number, updatedAt?: string | null }} Container */
/** @typedef {{ chatId: string }} ChatsGetArgs */
/** @typedef {{ chatId: string, formats: import('./constants.js').ExportFormat[] }} ChatsExportArgs */
/** @typedef {{ files: ExportFile[], payload: ExportPayload }} ChatsExportResult */
/** @typedef {{ text: string, title?: string }} ChatsCreateArgs */
/** @typedef {{ chatId: string }} ChatsDeleteArgs */
/** @typedef {{ deleted: true, chatId?: string }} ChatsDeleteResult */
/**
 * @typedef {{ tabId: number, platform: import('./constants.js').Platform, url: string,
 *   chatId: string, title: string, active: boolean }} BrowserTab
 */
/**
 * @typedef {{ type: 'hello', protocolVersion?: 1, v?: 1, key: string, browserId: string,
 *   browserLabel: string, extVersion: string, platformsEnabled: import('./constants.js').Platform[],
 *   allowCreate?: boolean, allowDestructive?: boolean, allowProjects?: boolean, tabs?: BrowserTab[] }} WsHello
 */
/** @typedef {{ type: 'welcome', v: 1, browserId: string, serverVersion: string, bound: boolean }} WsWelcome */
/**
 * @typedef {{ type: 'settings', platformsEnabled: import('./constants.js').Platform[],
 *   allowCreate?: boolean, allowDestructive?: boolean, allowProjects?: boolean, browserLabel?: string }} WsSettings
 */
/**
 * @typedef {{ type: 'tabs', browserId: string, tabs: BrowserTab[] }} WsTabs
 */
/** @typedef {{ type: 'error', code: import('./constants.js').ErrorCode, message: string, id?: string }} WsError */

const defs = {
  Platform: { type: 'string', enum: [...PLATFORMS] },
  Op: { type: 'string', enum: [...OPS] },
  ExportFormat: { type: 'string', enum: [...EXPORT_FORMATS] },
  ErrorCode: { type: 'string', enum: Object.values(ERROR_CODES) },
  BrowserTab: object(
    {
      tabId: { type: 'integer' },
      platform: ref('Platform'),
      url: str,
      chatId: str,
      title: str,
      active: { type: 'boolean' }
    },
    ['tabId', 'platform', 'url', 'chatId', 'title', 'active']
  ),

  Link: object({ text: str, href: nonEmpty }, ['text', 'href']),
  Source: object({ title: str, url: nonEmpty }, ['title', 'url']),
  Message: object(
    {
      role: { type: 'string', enum: [...ROLES] },
      roleTag: str,
      text: str,
      links: { type: 'array', items: ref('Link') },
      sources: { type: 'array', items: ref('Source') }
    },
    ['role', 'roleTag', 'text']
  ),
  Chat: object(
    {
      platform: ref('Platform'),
      chatId: nonEmpty,
      title: str,
      url: str,
      updatedAt: isoOrNull,
      createdAt: isoOrNull,
      containerType: { type: 'string', enum: ['project'] },
      containerId: str,
      containerTitle: str
    },
    ['platform', 'chatId', 'title', 'url', 'updatedAt']
  ),
  Container: object(
    {
      platform: ref('Platform'),
      containerId: nonEmpty,
      containerType: { type: 'string', enum: ['project'] },
      title: str,
      url: str,
      chatCount: { type: 'integer', minimum: 0 },
      updatedAt: isoOrNull
    },
    ['platform', 'containerId', 'containerType', 'title']
  ),
  ExportPayload: object(
    {
      platform: ref('Platform'),
      url: str,
      title: str,
      chatId: str,
      model: str,
      userName: str,
      userHandle: str,
      userEmail: str,
      messages: { type: 'array', items: ref('Message') }
    },
    ['platform', 'url', 'title', 'chatId', 'model', 'userName', 'userHandle', 'userEmail', 'messages']
  ),
  ExportFile: {
    oneOf: [
      object({ name: nonEmpty, mime: nonEmpty, text: str }, ['name', 'mime', 'text']),
      object({ name: nonEmpty, mime: nonEmpty, b64: str }, ['name', 'mime', 'b64'])
    ]
  },

  RpcError: object(
    { code: ref('ErrorCode'), message: str, details: { type: 'object' } },
    ['code', 'message']
  ),
  RpcRequest: object(
    { type: str, id: nonEmpty, op: ref('Op'), platform: ref('Platform'), args: { type: 'object' } },
    ['id', 'op', 'platform', 'args']
  ),
  RpcResponse: {
    oneOf: [
      object({ type: str, id: nonEmpty, ok: { const: true }, data: {} }, ['id', 'ok', 'data']),
      object({ type: str, id: nonEmpty, ok: { const: false }, error: ref('RpcError') }, ['id', 'ok', 'error'])
    ]
  },

  ChatsListArgs: object({
    cursor: { type: ['string', 'null'] },
    limit: { type: 'integer', minimum: 1, maximum: LIST_LIMIT_MAX },
    query: str,
    includeProjectChats: { type: 'boolean' },
    containerId: str
  }),
  ChatsListResult: object(
    { items: { type: 'array', items: ref('Chat') }, nextCursor: { type: ['string', 'null'] } },
    ['items', 'nextCursor']
  ),
  ChatsGetArgs: object(
    { chatId: str, branch: { type: 'string', enum: ['active', 'all'] } },
    ['chatId']
  ),
  FileRef: object({ path: nonEmpty, name: nonEmpty, mime: nonEmpty }, ['path']),
  WireFile: object(
    { name: nonEmpty, mime: nonEmpty, size: { type: 'integer', minimum: 0 }, b64: str },
    ['name', 'mime', 'size', 'b64']
  ),
  ChatsSendArgs: object(
    {
      chatId: nonEmpty,
      text: nonEmpty,
      model: str,
      mode: str,
      toggles: { type: 'array', items: str, uniqueItems: true },
      tools: { type: 'array', items: nonEmpty },
      files: { type: 'array', items: ref('WireFile') }
    },
    ['chatId', 'text']
  ),
  McpChatsSendArgs: object(
    {
      chatId: nonEmpty,
      text: nonEmpty,
      model: str,
      mode: str,
      toggles: { type: 'array', items: str, uniqueItems: true },
      tools: { type: 'array', items: nonEmpty },
      files: { type: 'array', items: ref('FileRef') }
    },
    ['chatId', 'text']
  ),
  ChatsSendResult: ref('Chat'),
  PlatformHostStateArgs: object({ chatId: str }),
  PlatformHostStateResult: object(
    {
      platform: ref('Platform'),
      generating: { type: 'boolean' },
      busy: { type: 'boolean' },
      banner: { type: ['string', 'null'] },
      composerReady: { type: 'boolean' }
    },
    ['platform', 'generating', 'busy', 'banner', 'composerReady']
  ),
  McpChatsExportArgs: object(
    {
      chatId: str,
      formats: { type: 'array', items: ref('ExportFormat'), minItems: 1, uniqueItems: true },
      outDir: str,
      branch: { type: 'string', enum: ['active', 'all'] }
    },
    ['chatId', 'formats']
  ),
  ChatsGetResult: ref('ExportPayload'),
  ChatsExportArgs: object(
    {
      chatId: str,
      formats: { type: 'array', items: ref('ExportFormat'), minItems: 1, uniqueItems: true },
      branch: { type: 'string', enum: ['active', 'all'] }
    },
    ['chatId', 'formats']
  ),
  ChatsExportResult: object(
    { files: { type: 'array', items: ref('ExportFile') }, payload: ref('ExportPayload') },
    ['files', 'payload']
  ),
  Option: object(
    {
      id: nonEmpty,
      label: nonEmpty,
      kind: { type: 'string', enum: ['model', 'mode', 'toggle', 'tool'] },
      locked: { type: 'boolean' }
    },
    ['id', 'label', 'kind']
  ),
  AttachInfo: object(
    {
      supported: { type: 'boolean' },
      multiple: { type: 'boolean' },
      accept: { type: 'array', items: str, uniqueItems: true },
      maxFiles: { type: 'integer', minimum: 1 }
    },
    ['supported', 'multiple', 'accept']
  ),
  Capabilities: object(
    {
      platform: ref('Platform'),
      plan: str,
      models: { type: 'array', items: ref('Option') },
      modes: { type: 'array', items: ref('Option') },
      toggles: { type: 'array', items: ref('Option') },
      tools: { type: 'array', items: ref('Option') },
      attach: ref('AttachInfo'),
      current: object(
        {
          model: str,
          mode: str,
          toggles: { type: 'array', items: str, uniqueItems: true }
        },
        []
      ),
      detectedAt: { type: 'string', format: 'date-time' }
    },
    ['platform', 'models', 'modes', 'toggles', 'tools', 'attach', 'current', 'detectedAt']
  ),
  PlatformCapabilitiesArgs: object({ refresh: { type: 'boolean' } }, []),
  McpChatsCreateArgs: object(
    {
      text: nonEmpty,
      title: str,
      model: str,
      mode: str,
      toggles: { type: 'array', items: str, uniqueItems: true },
      tools: { type: 'array', items: nonEmpty },
      files: { type: 'array', items: ref('FileRef') }
    },
    ['text']
  ),
  ChatsCreateArgs: object(
    {
      text: nonEmpty,
      title: str,
      model: str,
      mode: str,
      toggles: { type: 'array', items: str, uniqueItems: true },
      tools: { type: 'array', items: nonEmpty },
      files: { type: 'array', items: ref('WireFile') }
    },
    ['text']
  ),
  ChatsCreateResult: ref('Chat'),
  ChatsDeleteArgs: object({ chatId: nonEmpty }, ['chatId']),
  ChatsDeleteResult: object({ deleted: { const: true }, chatId: str }, ['deleted']),

  ContainersListArgs: object({
    cursor: { type: ['string', 'null'] },
    limit: { type: 'integer', minimum: 1, maximum: LIST_LIMIT_MAX },
    query: str
  }),
  ContainersListResult: object(
    { items: { type: 'array', items: ref('Container') }, nextCursor: { type: ['string', 'null'] } },
    ['items', 'nextCursor']
  ),
  ContainersChatsArgs: object(
    {
      containerId: nonEmpty,
      cursor: { type: ['string', 'null'] },
      limit: { type: 'integer', minimum: 1, maximum: LIST_LIMIT_MAX }
    },
    ['containerId']
  ),
  ContainersCreateArgs: object(
    { name: nonEmpty, description: str, instructions: str },
    ['name']
  ),
  ContainersCreateResult: ref('Container'),
  ContainersDeleteArgs: object(
    { containerId: nonEmpty, name: str, confirm: { const: true } },
    ['containerId', 'confirm']
  ),
  ContainersDeleteResult: object({ deleted: { const: true }, containerId: str }, ['deleted']),
  ContainersMoveChatArgs: object(
    {
      chatId: nonEmpty,
      containerId: { type: ['string', 'null'] }
    },
    ['chatId']
  ),
  ContainersMoveChatResult: ref('Chat'),

  WsHelloCurrent: object(
    {
      type: { const: WS_TYPES.HELLO },
      protocolVersion: { const: PROTOCOL_VERSION },
      key: nonEmpty,
      browserId: nonEmpty,
      browserLabel: str,
      extVersion: str,
      platformsEnabled: { type: 'array', items: ref('Platform'), uniqueItems: true },
      allowCreate: { type: 'boolean' },
      allowDestructive: { type: 'boolean' },
      allowProjects: { type: 'boolean' },
      tabs: { type: 'array', items: ref('BrowserTab') }
    },
    ['type', 'protocolVersion', 'key', 'browserId', 'browserLabel', 'extVersion', 'platformsEnabled']
  ),
  WsHelloLegacy: object(
    {
      type: { const: WS_TYPES.HELLO },
      v: { const: PROTOCOL_VERSION },
      key: nonEmpty,
      browserId: nonEmpty,
      browserLabel: str,
      extVersion: str,
      platformsEnabled: { type: 'array', items: ref('Platform'), uniqueItems: true },
      allowCreate: { type: 'boolean' },
      allowDestructive: { type: 'boolean' },
      allowProjects: { type: 'boolean' },
      tabs: { type: 'array', items: ref('BrowserTab') }
    },
    ['type', 'v', 'key', 'browserId', 'browserLabel', 'extVersion', 'platformsEnabled']
  ),
  WsHello: {
    oneOf: [ref('WsHelloCurrent'), ref('WsHelloLegacy')]
  },
  WsWelcome: object(
    {
      type: { const: WS_TYPES.WELCOME },
      v: { const: PROTOCOL_VERSION },
      browserId: nonEmpty,
      serverVersion: str,
      bound: { type: 'boolean' }
    },
    ['type', 'v', 'browserId', 'serverVersion', 'bound']
  ),
  WsSettings: object(
    {
      type: { const: WS_TYPES.SETTINGS },
      platformsEnabled: { type: 'array', items: ref('Platform'), uniqueItems: true },
      allowCreate: { type: 'boolean' },
      allowDestructive: { type: 'boolean' },
      allowProjects: { type: 'boolean' },
      browserLabel: str
    },
    ['type', 'platformsEnabled']
  ),
  WsTabs: object(
    {
      type: { const: WS_TYPES.TABS },
      browserId: nonEmpty,
      tabs: { type: 'array', items: ref('BrowserTab') }
    },
    ['type', 'browserId', 'tabs']
  ),
  WsError: object(
    { type: { const: WS_TYPES.ERROR }, code: ref('ErrorCode'), message: str, id: str },
    ['type', 'code', 'message']
  )
};

export const OP_SCHEMAS = Object.freeze({
  'chats.list': { args: 'ChatsListArgs', result: 'ChatsListResult' },
  'chats.get': { args: 'ChatsGetArgs', result: 'ChatsGetResult' },
  'chats.export': { args: 'ChatsExportArgs', result: 'ChatsExportResult' },
  'chats.create': { args: 'ChatsCreateArgs', result: 'ChatsCreateResult' },
  'chats.delete': { args: 'ChatsDeleteArgs', result: 'ChatsDeleteResult' },
  'chats.send': { args: 'ChatsSendArgs', result: 'ChatsSendResult' },
  'platform.capabilities': { args: 'PlatformCapabilitiesArgs', result: 'Capabilities' },
  'platform.host_state': { args: 'PlatformHostStateArgs', result: 'PlatformHostStateResult' },
  'containers.list': { args: 'ContainersListArgs', result: 'ContainersListResult' },
  'containers.chats': { args: 'ContainersChatsArgs', result: 'ChatsListResult' },
  'containers.create': { args: 'ContainersCreateArgs', result: 'ContainersCreateResult' },
  'containers.delete': { args: 'ContainersDeleteArgs', result: 'ContainersDeleteResult' },
  'containers.move_chat': { args: 'ContainersMoveChatArgs', result: 'ContainersMoveChatResult' }
});

export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/svergio/chat-export-server/protocol/v' + PROTOCOL_VERSION + '.json',
  title: 'chat-export protocol v' + PROTOCOL_VERSION,
  'x-protocol-version': PROTOCOL_VERSION,
  'x-ops': OP_SCHEMAS,
  $defs: defs
};
