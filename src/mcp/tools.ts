import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import {
  PLATFORMS,
  EXPORT_FORMATS,
  EXPORT_SCHEMAS,
  ERROR_CODES,
  RETRYABLE_ERROR_CODES
} from '@chat-export/protocol';
import { toProtocolError } from '../core/errors.js';
import type { ServerCore } from '../core/server-core.js';

type ToolArgs = Record<string, any>;
type ToolHandler = (args: any) => Promise<unknown> | unknown;
type ErrorContext = { platform?: string | null; duration_ms?: number };

type ToolMeta = {
  description: string;
  inputSchema: Record<string, any>;
  annotations?: ToolAnnotations;
};

const Platform = z
  .enum([...PLATFORMS] as [string, ...string[]])
  .describe('Provider id: chatgpt | grok | grok-x | claude | copilot | qwen | deepseek | perplexity');
const ExportFormat = z
  .enum([...EXPORT_FORMATS] as [string, ...string[]])
  .describe('Export format id supported by the extension builders');
const ExportSchema = z
  .enum([...EXPORT_SCHEMAS] as [string, ...string[]])
  .describe('Export text schema id (name/version), e.g. chat-export/1 or sharegpt/1');
const JobKind = z
  .enum(['ask', 'export', 'export_batch', 'delete', 'delete_batch'])
  .describe('Background job kind for the bound browser lane');
const Branch = z
  .enum(['active', 'all'])
  .describe('Conversation branch: active thread only, or all branches when the provider supports them');
const FileRef = z.object({
  path: z.string().min(1).describe('Absolute local file path to attach'),
  name: z.string().optional().describe('Display filename override'),
  mime: z.string().optional().describe('MIME type hint')
});

const annReadLive: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};
const annReadLocal: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
const annBind: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
const annMutateUi: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
};
const annDestructiveHost: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true
};
const annCacheWrite: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};
const annCacheDelete: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
};
const annJobsMutate: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
};

const RETRYABLE_CODES = new Set<string>([
  ...RETRYABLE_ERROR_CODES,
  ERROR_CODES.TIMEOUT,
  ERROR_CODES.HOST_ERROR,
  ERROR_CODES.NOT_BOUND
]);

function okResult(data: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function hintForError(code: string, platform?: string | null): string | null {
  if (code === ERROR_CODES.NOT_BOUND) return 'Call browsers_bind with a connected browserId from browsers_list';
  if (code === ERROR_CODES.UNAUTHORIZED) return 'Check MCP cem_ token and browser ceb_ token enrollment';
  if (code === ERROR_CODES.PLATFORM_DISABLED) {
    return 'Enable the platform in server settings and the extension popup';
  }
  if (code === ERROR_CODES.CREATE_DISABLED) return 'Turn on allowCreate in the extension advanced settings';
  if (code === ERROR_CODES.DESTRUCTIVE_DISABLED) {
    return 'Enable allowDestructive on server and browser, and pass confirm:true';
  }
  if (code === ERROR_CODES.PROJECTS_DISABLED) return 'Enable allowProjects on the bound browser';
  if (code === ERROR_CODES.TIMEOUT) return 'Retry after the provider UI finishes loading or increase rpcTimeoutS';
  if (code === ERROR_CODES.HOST_ERROR && platform) {
    return `Check if ${platform} tab is logged in or inspect recentAlerts`;
  }
  if (code === ERROR_CODES.HOST_ERROR) return 'Inspect recentAlerts and server.log for the host error detail';
  return null;
}

function detailedErrorBody(core: ServerCore, tool: string, err: unknown, ctx: ErrorContext) {
  const pe = toProtocolError(err);
  const platform = ctx.platform || (pe.details as Record<string, any> | undefined)?.platform || null;
  const context = core.mcpErrorContext(platform);
  const code = pe.code || ERROR_CODES.HOST_ERROR;
  return {
    ok: false,
    tool,
    error: {
      code,
      message: pe.message,
      retryable: RETRYABLE_CODES.has(code),
      browserId: context.browserId,
      platform: platform || context.platform,
      activeTabsOnPlatform: context.activeTabsOnPlatform,
      permissions: context.permissions,
      recentAlerts: context.recentAlerts,
      hint: hintForError(code, platform || context.platform),
      details: pe.details || undefined,
      duration_ms: ctx.duration_ms
    }
  };
}

function detailedErrResult(core: ServerCore, tool: string, err: unknown, ctx: ErrorContext) {
  const body = detailedErrorBody(core, tool, err, ctx);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }]
  };
}

function withDetailedMcpTool(tool: string, core: ServerCore, handler: ToolHandler) {
  return async (args: any) => {
    const started = Date.now();
    const platform = typeof args?.platform === 'string' ? args.platform : null;
    try {
      const data = await handler(args);
      const duration_ms = Date.now() - started;
      core.logMcpToolResult(tool, { platform, duration_ms, ok: true });
      return okResult(data);
    } catch (err) {
      const duration_ms = Date.now() - started;
      const pe = toProtocolError(err);
      core.logMcpToolResult(tool, {
        platform,
        duration_ms,
        ok: false,
        code: pe.code,
        message: pe.message,
        detail: pe.details || null
      });
      return detailedErrResult(core, tool, err, { platform, duration_ms });
    }
  };
}

function registerDetailedTool(
  server: McpServer,
  core: ServerCore,
  name: string,
  meta: ToolMeta,
  handler: ToolHandler
): void {
  server.registerTool(name, meta, withDetailedMcpTool(name, core, handler) as any);
}

export function registerTools(server: McpServer, core: ServerCore): void {
  registerDetailedTool(
    server,
    core,
    'browsers_list',
    {
      description:
        'List Chrome profiles currently connected through the Chat Export extension bridge. Use before browsers_bind to pick a browserId; use browsers_status for the already-bound session only.',
      inputSchema: {},
      annotations: annReadLocal
    },
    async () => core.browsersList()
  );

  registerDetailedTool(
    server,
    core,
    'browsers_bind',
    {
      description:
        'Set the active browserId for subsequent chat/project/job tools. Call after browsers_list; does not open tabs by itself. Prefer browsers_status to inspect the current binding without changing it.',
      inputSchema: {
        browserId: z.string().min(1).describe('browserId from browsers_list')
      },
      annotations: annBind
    },
    async ({ browserId }) => core.browsersBind(browserId)
  );

  registerDetailedTool(
    server,
    core,
    'browsers_status',
    {
      description:
        'Show the currently bound browserId, connection state, and recent alerts. Prefer over browsers_list when you already bound a browser and only need health/permissions.',
      inputSchema: {},
      annotations: annReadLocal
    },
    async () => core.browsersStatus()
  );

  registerDetailedTool(
    server,
    core,
    'platforms_list',
    {
      description:
        'List supported providers and whether each is enabled on the server and the bound browser. Requires browsers_bind for browser-side enablement; use before chats_* when unsure which platforms are available.',
      inputSchema: {},
      annotations: annReadLive
    },
    async () => core.platformsList()
  );

  registerDetailedTool(
    server,
    core,
    'platforms_capabilities',
    {
      description: 'Read composer capabilities (models, modes, toggles, attach) from the bound browser tab.',
      inputSchema: {
        platform: Platform,
        refresh: z.boolean().optional()
      }
    },
    async ({ platform, refresh }) => {
      const args: ToolArgs = {};
      if (refresh !== undefined) args.refresh = refresh;
      return core.platformCapabilities(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chats_list',
    {
      description:
        'List chats for one platform in the bound browser (titles/ids, optional query). Prefer for discovery; use projects_chats for chats inside one project, chats_get for a full payload, chat_outline for turn indexes. Requires prior browsers_bind.',
      inputSchema: {
        platform: Platform,
        cursor: z
          .string()
          .nullable()
          .optional()
          .describe('Opaque pagination cursor from a previous chats_list response; null/omit for first page'),
        limit: z.number().int().min(1).max(100).optional().describe('Max chats to return (1-100)'),
        query: z.string().optional().describe('Optional title/text search filter when the provider supports it'),
        includeProjectChats: z
          .boolean()
          .optional()
          .describe('When true (default), also include chats that live inside projects/folders')
      },
      annotations: annReadLive
    },
    async ({ platform, cursor, limit, query, includeProjectChats }) => {
      const args: ToolArgs = {};
      if (cursor !== undefined) args.cursor = cursor;
      if (limit !== undefined) args.limit = limit;
      if (query !== undefined) args.query = query;
      if (includeProjectChats !== undefined) args.includeProjectChats = includeProjectChats;
      return core.chatsList(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chats_get',
    {
      description:
        'Return the full ExportPayload for one chat on the bound browser. Prefer for a complete dump of a known chatId; for turn index/previews use chat_outline, for a bounded slice use chat_read, for offline SQLite reuse use chat_cache_*. Empty chatId = currently open tab. Requires browsers_bind.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().describe('Chat id, or empty string for the currently open tab'),
        branch: Branch.optional()
      },
      annotations: annReadLive
    },
    async ({ platform, chatId, branch }) => {
      const args: ToolArgs = { chatId };
      if (branch !== undefined) args.branch = branch;
      return core.chatsGet(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chat_outline',
    {
      description:
        'Build a turn index with short previews for a chat (auto-warms the SQLite cache for long threads). Prefer before chat_read to choose start/end indexes; use chats_get for the full payload, chat_cache_read when the cache is already warm. Empty/omitted chatId = open tab. Requires browsers_bind.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().optional().describe('Chat id; omit or empty for the open tab'),
        previewChars: z
          .number()
          .int()
          .min(40)
          .max(300)
          .optional()
          .describe('Preview length per turn (40-300 chars)'),
        branch: Branch.optional()
      },
      annotations: annReadLive
    },
    async (input) => {
      const args: ToolArgs = {};
      if (input.chatId !== undefined) args.chatId = input.chatId;
      if (input.previewChars !== undefined) args.previewChars = input.previewChars;
      if (input.branch !== undefined) args.branch = input.branch;
      return core.chatOutline(input.platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chat_read',
    {
      description:
        'Read a bounded slice of chat turns with a maxChars cap (uses/auto-fills the SQLite cache). Prefer after chat_outline for start/end indexes; use chats_get for the entire chat, chat_cache_read for offline cache-only access. Requires browsers_bind when the cache miss needs a host fetch.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().describe('Chat id to read'),
        start: z.number().int().optional().describe('Inclusive start turn index from chat_outline'),
        end: z.number().int().optional().describe('Exclusive end turn index from chat_outline'),
        maxChars: z
          .number()
          .int()
          .min(200)
          .max(20000)
          .optional()
          .describe('Hard cap on returned characters (200-20000)'),
        branch: Branch.optional()
      },
      annotations: annReadLive
    },
    async (input) => {
      const args: ToolArgs = { chatId: input.chatId };
      if (input.start !== undefined) args.start = input.start;
      if (input.end !== undefined) args.end = input.end;
      if (input.maxChars !== undefined) args.maxChars = input.maxChars;
      if (input.branch !== undefined) args.branch = input.branch;
      return core.chatRead(input.platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chats_export',
    {
      description:
        'Export one chat via extension builders and write files under exportDir (returns paths). Prefer for durable files; use chats_get for in-memory payload, jobs_enqueue kind=export/export_batch for bulk/async queues. Set async:true to return job_id instead of blocking. Requires browsers_bind; writes to disk.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().describe('Chat id to export'),
        formats: z.array(ExportFormat).min(1).describe('One or more export formats to write'),
        schema: ExportSchema.optional().describe(
          'Text layout schema (name/version). Default: server settings.exportSchema then browser default chat-export/1'
        ),
        outDir: z.string().optional().describe('Absolute path under HOME; default server exportDir'),
        branch: Branch.optional(),
        async: z
          .boolean()
          .optional()
          .describe('When true, enqueue via jobs and return job_id instead of blocking')
      },
      annotations: annMutateUi
    },
    async ({ platform, chatId, formats, schema, outDir, branch, async: asyncExport }) => {
      const resolvedSchema =
        schema ||
        (core.config.settings && core.config.settings.exportSchema) ||
        'chat-export/1';
      if (asyncExport === true) {
        const spec: ToolArgs = { kind: 'export', platform, chatId, formats, schema: resolvedSchema };
        if (outDir !== undefined) spec.outDir = outDir;
        if (branch !== undefined) spec.branch = branch;
        return core.jobs.enqueue(spec as Parameters<typeof core.jobs.enqueue>[0]);
      }
      const args: ToolArgs = { chatId, formats, schema: resolvedSchema };
      if (outDir !== undefined) args.outDir = outDir;
      if (branch !== undefined) args.branch = branch;
      return core.chatsExport(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chats_create',
    {
      description:
        'Create a new chat on the provider UI in the bound browser and seed it with text. Prefer chat_ask when you also need to wait for the assistant reply; use chats_create only to open/seed a chat. Requires browsers_bind and allowCreate on the extension.',
      inputSchema: {
        platform: Platform,
        text: z.string().min(1).describe('Initial user message text to place in the new chat'),
        title: z.string().optional().describe('Optional title when the provider supports setting one'),
        model: z.string().optional(),
        mode: z.string().optional(),
        toggles: z.array(z.string()).optional(),
        tools: z.array(z.string()).optional(),
        files: z.array(FileRef).optional()
      },
      annotations: annMutateUi
    },
    async ({ platform, text, title, model, mode, toggles, tools, files }) => {
      const args: ToolArgs = { text };
      if (title !== undefined) args.title = title;
      if (model !== undefined) args.model = model;
      if (mode !== undefined) args.mode = mode;
      if (toggles !== undefined) args.toggles = toggles;
      if (tools !== undefined) args.tools = tools;
      if (files !== undefined) args.files = files;
      return core.chatsCreate(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chats_send',
    {
      description: 'Send a follow-up message in an existing chat via the bound browser.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1),
        text: z.string().min(1),
        model: z.string().optional(),
        mode: z.string().optional(),
        toggles: z.array(z.string()).optional(),
        tools: z.array(z.string()).optional(),
        files: z.array(FileRef).optional()
      }
    },
    async ({ platform, chatId, text, model, mode, toggles, tools, files }) => {
      const args: ToolArgs = { chatId, text };
      if (model !== undefined) args.model = model;
      if (mode !== undefined) args.mode = mode;
      if (toggles !== undefined) args.toggles = toggles;
      if (tools !== undefined) args.tools = tools;
      if (files !== undefined) args.files = files;
      return core.chatsSend(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chat_ask',
    {
      description:
        'Send a prompt on a platform (new or existing chat) via the bound browser and wait for the assistant reply. Prefer over chats_create+manual wait; use jobs_enqueue kind=ask or wait:false for non-blocking. Requires browsers_bind; drives live provider UI (openWorld).',
      inputSchema: {
        platform: Platform,
        prompt: z.string().min(1).describe('User prompt to send'),
        chatId: z.string().optional().describe('Existing chat id; omit to create/continue per platform defaults'),
        title: z.string().optional().describe('Optional title when creating a new chat'),
        timeout_s: z
          .number()
          .int()
          .min(10)
          .max(300)
          .optional()
          .describe('Max seconds to wait for the assistant reply (10-300)'),
        wait: z.boolean().optional().describe('Default true; false returns job_id immediately'),
        browserId: z.string().optional().describe('Override bound browserId for this call only'),
        model: z.string().optional().describe('Provider model id when the UI exposes a model picker'),
        mode: z.string().optional().describe('Provider mode/style id when applicable'),
        toggles: z.array(z.string()).optional().describe('Provider UI toggle ids to enable'),
        tools: z.array(z.string()).optional().describe('Provider tool/plugin ids to enable'),
        files: z.array(FileRef).optional().describe('Local files to attach to the prompt')
      },
      annotations: annMutateUi
    },
    async (input) => core.chatAsk(input)
  );

  const TurnInput = z.object({
    role: z.string().optional().describe('Turn role (user/assistant/system/tool)'),
    text: z.string().optional().describe('Plain text body for the turn'),
    content: z.string().optional().describe('Alternate content field when text is not used')
  });

  registerDetailedTool(
    server,
    core,
    'chat_cache_sync',
    {
      description:
        'Fetch a chat from the bound browser and store blocks+FTS5 in the temp SQLite cache. Prefer before repeated chat_cache_read on long threads; use chat_outline/chat_read when you need live outline/slice without an explicit sync. Writes local cache only; requires browsers_bind for the host fetch.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1).describe('Chat id to sync into the local cache'),
        browserId: z.string().optional().describe('Override bound browserId for this sync'),
        branch: z.string().optional().describe('Branch selector when the provider supports multiple branches'),
        force: z.boolean().optional().describe('When true, refresh even if a cache copy already exists')
      },
      annotations: annCacheWrite
    },
    async (input) => core.chatCacheSync(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_read',
    {
      description:
        'Read cached chat blocks from local SQLite by turn range, blockId, or FTS query without hitting the browser. Prefer after chat_cache_sync/chat_outline; use chat_read when the cache may be cold and a live fetch is OK. Identify the copy via cacheId or platform+chatId.',
      inputSchema: {
        cacheId: z.string().optional().describe('Cache row id from a previous sync/outline'),
        platform: Platform.optional(),
        chatId: z.string().optional().describe('Chat id when selecting cache by platform+chatId'),
        startTurn: z.number().int().min(0).optional().describe('Inclusive start turn index'),
        endTurn: z.number().int().min(0).optional().describe('Exclusive end turn index'),
        blockId: z.string().optional().describe('Specific cached block id to return'),
        query: z.string().optional().describe('FTS5 search query over cached turn text'),
        maxChars: z
          .number()
          .int()
          .min(200)
          .max(200000)
          .optional()
          .describe('Hard cap on returned characters (200-200000)')
      },
      annotations: annReadLocal
    },
    async (input) => core.chatCacheRead(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_append',
    {
      description:
        'Append turns to an existing local SQLite cache copy and refresh FTS/totals. Prefer for incremental offline updates; use chat_cache_sync to rebuild from the live tab, chat_cache_update_block to edit one turn. Does not write to the provider UI.',
      inputSchema: {
        cacheId: z.string().optional().describe('Cache row id to append into'),
        platform: Platform.optional(),
        chatId: z.string().optional().describe('Chat id when selecting cache by platform+chatId'),
        turns: z.array(TurnInput).min(1).describe('One or more turns to append')
      },
      annotations: annCacheWrite
    },
    async (input) => core.chatCacheAppend(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_update_block',
    {
      description:
        'Update one cached block (bumps revision) or resync that turn from the live tab via resyncFromHost. Prefer for surgical cache edits; use chat_cache_append to add turns, chat_cache_sync to refresh the whole chat. Local cache only unless resyncFromHost needs the bound browser.',
      inputSchema: {
        cacheId: z.string().optional().describe('Cache row id containing the block'),
        platform: Platform.optional(),
        chatId: z.string().optional().describe('Chat id when selecting cache by platform+chatId'),
        turnIndex: z.number().int().min(0).describe('Zero-based turn index of the block to update'),
        content: z.string().optional().describe('Replacement content when not resyncing from host'),
        role: z.string().optional().describe('Optional role override for the block'),
        resyncFromHost: z
          .boolean()
          .optional()
          .describe('When true, refresh this turn from the live provider tab instead of content')
      },
      annotations: annCacheWrite
    },
    async (input) => core.chatCacheUpdateBlock(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_delete',
    {
      description:
        'Delete a temp SQLite cached chat (metadata, blocks, FTS). Does not delete the provider chat — use chats_delete for that. Identify via cacheId or platform+chatId. Idempotent on missing rows.',
      inputSchema: {
        cacheId: z.string().optional().describe('Cache row id to delete'),
        platform: Platform.optional(),
        chatId: z.string().optional().describe('Chat id when selecting cache by platform+chatId')
      },
      annotations: annCacheDelete
    },
    async (input) => core.chatCacheDelete(input)
  );

  const ContainersListInput = {
    platform: Platform,
    cursor: z
      .string()
      .nullable()
      .optional()
      .describe('Opaque pagination cursor; null/omit for first page'),
    limit: z.number().int().min(1).max(100).optional().describe('Max projects to return (1-100)'),
    query: z.string().optional().describe('Optional name filter when the provider supports it')
  };

  function pickContainersListArgs(input: ToolArgs): ToolArgs {
    const args: ToolArgs = {};
    if (input.cursor !== undefined) args.cursor = input.cursor;
    if (input.limit !== undefined) args.limit = input.limit;
    if (input.query !== undefined) args.query = input.query;
    return args;
  }

  registerDetailedTool(
    server,
    core,
    'projects_list',
    {
      description:
        'List projects/folders (containers) on a platform via the bound browser. Prefer this over containers_list (identical legacy alias). Use projects_chats for chats inside one project, chats_list for all chats. Requires browsers_bind.',
      inputSchema: ContainersListInput,
      annotations: annReadLive
    },
    async (input) => core.containersList(input.platform, pickContainersListArgs(input))
  );

  registerDetailedTool(
    server,
    core,
    'containers_list',
    {
      description:
        'Legacy alias identical to projects_list. Prefer projects_list for new agents; same args and result. Lists projects/folders on a platform via the bound browser.',
      inputSchema: ContainersListInput,
      annotations: annReadLive
    },
    async (input) => core.containersList(input.platform, pickContainersListArgs(input))
  );

  registerDetailedTool(
    server,
    core,
    'projects_chats',
    {
      description:
        'List chats inside one project/container on the bound browser. Prefer over chats_list when scoped to a known containerId; use projects_list first to discover ids. Requires browsers_bind.',
      inputSchema: {
        platform: Platform,
        containerId: z.string().min(1).describe('Project/container id from projects_list'),
        cursor: z
          .string()
          .nullable()
          .optional()
          .describe('Opaque pagination cursor; null/omit for first page'),
        limit: z.number().int().min(1).max(100).optional().describe('Max chats to return (1-100)')
      },
      annotations: annReadLive
    },
    async ({ platform, containerId, cursor, limit }) => {
      const args: ToolArgs = { containerId };
      if (cursor !== undefined) args.cursor = cursor;
      if (limit !== undefined) args.limit = limit;
      return core.containersChats(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'projects_create',
    {
      description:
        'Create a project/folder on the provider UI. Prefer when organizing chats; does not create chats (use chats_create/chat_ask). Requires browsers_bind and allowProjects on the browser.',
      inputSchema: {
        platform: Platform,
        name: z.string().min(1).describe('Project/folder display name'),
        description: z.string().optional().describe('Optional project description'),
        instructions: z.string().optional().describe('Optional custom instructions for the project')
      },
      annotations: annMutateUi
    },
    async ({ platform, name, description, instructions }) => {
      const args: ToolArgs = { name };
      if (description !== undefined) args.description = description;
      if (instructions !== undefined) args.instructions = instructions;
      return core.containersCreate(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'projects_delete',
    {
      description:
        'Permanently delete a project/folder on the provider. Destructive: requires confirm:true, allowProjects, and allowDestructive on the browser. Prefer projects_move_chat to rehome chats first. Does not delete local SQLite cache rows.',
      inputSchema: {
        platform: Platform,
        containerId: z.string().min(1).describe('Project/container id to delete'),
        name: z.string().optional().describe('Optional name hint for UI confirmation matching'),
        confirm: z.boolean().describe('Must be true to proceed with deletion')
      },
      annotations: annDestructiveHost
    },
    async ({ platform, containerId, name, confirm }) => {
      const args: ToolArgs = { containerId, confirm: confirm === true };
      if (name !== undefined) args.name = name;
      return core.containersDelete(platform, args, { confirm: confirm === true });
    }
  );

  registerDetailedTool(
    server,
    core,
    'projects_move_chat',
    {
      description:
        'Move a chat into a project, or pass containerId null to remove it from its project. Prefer over delete when reorganizing. Requires browsers_bind and allowProjects.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1).describe('Chat id to move'),
        containerId: z
          .string()
          .nullable()
          .optional()
          .describe('Target project id; null/omit-as-null removes the chat from its project')
      },
      annotations: annMutateUi
    },
    async ({ platform, chatId, containerId }) => {
      const args: ToolArgs = { chatId };
      if (containerId !== undefined) args.containerId = containerId;
      return core.containersMoveChat(platform, args);
    }
  );

  registerDetailedTool(
    server,
    core,
    'chats_delete',
    {
      description:
        'Permanently delete a chat on the provider UI. Destructive and audited: requires confirm:true plus allowDestructive on server and browser. Prefer chats_export first if you need a copy; chat_cache_delete only removes local cache.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1).describe('Chat id to delete on the provider'),
        confirm: z.boolean().describe('Must be true to proceed with deletion')
      },
      annotations: annDestructiveHost
    },
    async ({ platform, chatId, confirm }) => core.chatsDelete(platform, { chatId }, { confirm })
  );

  registerDetailedTool(
    server,
    core,
    'jobs_enqueue',
    {
      description:
        'Enqueue a background job on the bound browser lane (ask, export, export_batch, delete, delete_batch) and return job_id immediately. Prefer for long/bulk work; use chat_ask/chats_export synchronously when you can wait. Poll with jobs_status; cancel with jobs_cancel. Requires browsers_bind; delete kinds need confirm + allowDestructive.',
      inputSchema: {
        kind: JobKind,
        platform: Platform,
        browserId: z.string().optional().describe('Override bound browserId for this job'),
        prompt: z.string().optional().describe('Prompt text when kind=ask'),
        chatId: z.string().optional().describe('Target chat id for ask/export/delete'),
        title: z.string().optional().describe('Optional title when creating a chat for ask'),
        timeout_s: z
          .number()
          .int()
          .min(10)
          .max(300)
          .optional()
          .describe('Per-op timeout seconds for ask-like work (10-300)'),
        model: z.string().optional().describe('Provider model id for ask'),
        mode: z.string().optional().describe('Provider mode id for ask'),
        toggles: z.array(z.string()).optional().describe('Provider toggle ids for ask'),
        tools: z.array(z.string()).optional().describe('Provider tool ids for ask'),
        files: z.array(FileRef).optional().describe('Attachments for ask'),
        chatIds: z.array(z.string()).optional().describe('Chat ids for batch export/delete'),
        query: z.string().optional().describe('Optional filter query for batch discovery'),
        max: z.number().int().positive().optional().describe('Max items for batch jobs'),
        formats: z.array(ExportFormat).optional().describe('Export formats for export kinds'),
        schema: ExportSchema.optional().describe('Export text schema for export kinds'),
        outDir: z.string().optional().describe('Output directory for export kinds'),
        branch: z.string().optional().describe('Branch selector when applicable'),
        confirm: z.boolean().optional().describe('Required true for delete/delete_batch'),
        testOnly: z.boolean().optional().describe('When true, validate only without mutating')
      },
      annotations: annJobsMutate
    },
    async (input) => {
      if (
        (input.kind === 'export' || input.kind === 'export_batch') &&
        input.schema === undefined &&
        core.config.settings?.exportSchema
      ) {
        input = Object.assign({}, input, { schema: core.config.settings.exportSchema });
      }
      return core.jobs.enqueue(input);
    }
  );

  registerDetailedTool(
    server,
    core,
    'jobs_status',
    {
      description:
        'Get status, progress, result, or error for a job_id from jobs_enqueue. Prefer for polling one job; use jobs_list to browse many. Local job store only.',
      inputSchema: {
        job_id: z.string().min(1).describe('Job id returned by jobs_enqueue')
      },
      annotations: annReadLocal
    },
    async ({ job_id }) => core.jobs.status(job_id)
  );

  registerDetailedTool(
    server,
    core,
    'jobs_list',
    {
      description:
        'List background jobs newest-first with optional status/kind/browser filters. Prefer over repeated jobs_status when surveying the queue; use jobs_status for one job_id detail.',
      inputSchema: {
        status: z.string().optional().describe('Filter by job status string'),
        kind: JobKind.optional(),
        browserId: z.string().optional().describe('Filter jobs for one browserId'),
        limit: z.number().int().min(1).max(200).optional().describe('Max jobs to return (1-200)')
      },
      annotations: annReadLocal
    },
    async (input) => core.jobs.list(input)
  );

  registerDetailedTool(
    server,
    core,
    'jobs_cancel',
    {
      description:
        'Cancel a queued job immediately, or request cancel for a running job. Prefer when stopping work started via jobs_enqueue/chat_ask wait:false. Does not roll back provider-side side effects already applied.',
      inputSchema: {
        job_id: z.string().min(1).describe('Job id to cancel')
      },
      annotations: annJobsMutate
    },
    async ({ job_id }) => core.jobs.cancel(job_id)
  );
}

export { withDetailedMcpTool, detailedErrorBody };
