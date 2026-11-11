import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PLATFORMS, EXPORT_FORMATS, ERROR_CODES } from '@chat-export/protocol';
import { toProtocolError } from '../core/errors.js';
import type { ServerCore } from '../core/server-core.js';

type ToolArgs = Record<string, any>;
type ToolHandler = (args: any) => Promise<unknown> | unknown;
type ErrorContext = { platform?: string | null; duration_ms?: number };

const Platform = z.enum([...PLATFORMS] as [string, ...string[]]);
const ExportFormat = z.enum([...EXPORT_FORMATS] as [string, ...string[]]);

const RETRYABLE_CODES = new Set<string>([ERROR_CODES.TIMEOUT, ERROR_CODES.HOST_ERROR, ERROR_CODES.NOT_BOUND]);

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
  meta: { description: string; inputSchema: Record<string, any> },
  handler: ToolHandler
): void {
  server.registerTool(name, meta, withDetailedMcpTool(name, core, handler) as any);
}

// Register MCP tools on an McpServer against ServerCore.
export function registerTools(server: McpServer, core: ServerCore): void {
  registerDetailedTool(
    server,
    core,
    'browsers_list',
    {
      description: 'List browsers (Chrome profiles) connected via the Chat Export extension.',
      inputSchema: {}
    },
    async () => core.browsersList()
  );

  registerDetailedTool(
    server,
    core,
    'browsers_bind',
    {
      description: 'Bind subsequent chat ops to a connected browserId.',
      inputSchema: {
        browserId: z.string().min(1).describe('browserId from browsers_list')
      }
    },
    async ({ browserId }) => core.browsersBind(browserId)
  );

  registerDetailedTool(
    server,
    core,
    'browsers_status',
    {
      description: 'Show bound browser and connection status.',
      inputSchema: {}
    },
    async () => core.browsersStatus()
  );

  registerDetailedTool(
    server,
    core,
    'platforms_list',
    {
      description: 'List platforms and whether they are enabled on server and bound browser.',
      inputSchema: {}
    },
    async () => core.platformsList()
  );

  registerDetailedTool(
    server,
    core,
    'chats_list',
    {
      description: 'List chats on a platform via the bound browser.',
      inputSchema: {
        platform: Platform,
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        query: z.string().optional(),
        includeProjectChats: z
          .boolean()
          .optional()
          .describe('When true (default), also list chats inside projects via containers.*')
      }
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
      description: 'Get one chat as ExportPayload. Empty chatId means the open tab.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().describe('chat id, or empty string for current tab')
      }
    },
    async ({ platform, chatId }) => core.chatsGet(platform, { chatId })
  );

  registerDetailedTool(
    server,
    core,
    'chats_export',
    {
      description:
        'Export a chat via the extension builders; server writes files under exportDir and returns paths.',
      inputSchema: {
        platform: Platform,
        chatId: z.string(),
        formats: z.array(ExportFormat).min(1)
      }
    },
    async ({ platform, chatId, formats }) => core.chatsExport(platform, { chatId, formats })
  );

  registerDetailedTool(
    server,
    core,
    'chats_create',
    {
      description: 'Create a new chat on the platform (UI drive in the bound browser).',
      inputSchema: {
        platform: Platform,
        text: z.string().min(1),
        title: z.string().optional()
      }
    },
    async ({ platform, text, title }) => {
      const args: ToolArgs = { text };
      if (title !== undefined) args.title = title;
      return core.chatsCreate(platform, args);
    }
  );

  const TurnInput = z.object({
    role: z.string().optional(),
    text: z.string().optional(),
    content: z.string().optional()
  });

  registerDetailedTool(
    server,
    core,
    'chat_cache_sync',
    {
      description:
        'Fetch a chat from the bound browser and store it in the temp SQLite cache (blocks + FTS5 index).',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1),
        browserId: z.string().optional(),
        branch: z.string().optional(),
        force: z.boolean().optional()
      }
    },
    async (input) => core.chatCacheSync(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_read',
    {
      description:
        'Read cached chat blocks from SQLite (by turn range, blockId, or FTS query) without hitting the browser.',
      inputSchema: {
        cacheId: z.string().optional(),
        platform: Platform.optional(),
        chatId: z.string().optional(),
        startTurn: z.number().int().min(0).optional(),
        endTurn: z.number().int().min(0).optional(),
        blockId: z.string().optional(),
        query: z.string().optional(),
        maxChars: z.number().int().min(200).max(200000).optional()
      }
    },
    async (input) => core.chatCacheRead(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_append',
    {
      description: 'Append new turns to an existing cached chat copy (updates FTS and totals).',
      inputSchema: {
        cacheId: z.string().optional(),
        platform: Platform.optional(),
        chatId: z.string().optional(),
        turns: z.array(TurnInput).min(1)
      }
    },
    async (input) => core.chatCacheAppend(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_update_block',
    {
      description:
        'Update one cached block (bumps revision). Set resyncFromHost to refresh that turn from the live tab.',
      inputSchema: {
        cacheId: z.string().optional(),
        platform: Platform.optional(),
        chatId: z.string().optional(),
        turnIndex: z.number().int().min(0),
        content: z.string().optional(),
        role: z.string().optional(),
        resyncFromHost: z.boolean().optional()
      }
    },
    async (input) => core.chatCacheUpdateBlock(input)
  );

  registerDetailedTool(
    server,
    core,
    'chat_cache_delete',
    {
      description: 'Remove a temp cached chat (metadata, blocks, and FTS rows).',
      inputSchema: {
        cacheId: z.string().optional(),
        platform: Platform.optional(),
        chatId: z.string().optional()
      }
    },
    async (input) => core.chatCacheDelete(input)
  );

  const ContainersListInput = {
    platform: Platform,
    cursor: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    query: z.string().optional()
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
      description: 'List projects/folders (containers) on a platform via the bound browser.',
      inputSchema: ContainersListInput
    },
    async (input) => core.containersList(input.platform, pickContainersListArgs(input))
  );

  registerDetailedTool(
    server,
    core,
    'containers_list',
    {
      description: 'Alias of projects_list: list projects/folders on a platform.',
      inputSchema: ContainersListInput
    },
    async (input) => core.containersList(input.platform, pickContainersListArgs(input))
  );

  registerDetailedTool(
    server,
    core,
    'projects_chats',
    {
      description: 'List chats inside a specific project/container.',
      inputSchema: {
        platform: Platform,
        containerId: z.string().min(1),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(100).optional()
      }
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
      description: 'Create a project/folder on the platform (requires allowProjects on the browser).',
      inputSchema: {
        platform: Platform,
        name: z.string().min(1),
        description: z.string().optional(),
        instructions: z.string().optional()
      }
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
        'Delete a project/folder. Requires confirm:true, allowProjects, and allowDestructive on the browser.',
      inputSchema: {
        platform: Platform,
        containerId: z.string().min(1),
        name: z.string().optional(),
        confirm: z.boolean().describe('must be true to proceed')
      }
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
      description: 'Move a chat into a project (containerId null removes from project).',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1),
        containerId: z.string().nullable().optional()
      }
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
        'Delete a chat. Requires confirm:true and allowDestructive on server and browser. Always audited.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().min(1),
        confirm: z.boolean().describe('must be true to proceed')
      }
    },
    async ({ platform, chatId, confirm }) => core.chatsDelete(platform, { chatId }, { confirm })
  );
}

export { withDetailedMcpTool, detailedErrorBody };
