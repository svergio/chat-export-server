import { z } from 'zod';
import { PLATFORMS, EXPORT_FORMATS, ERROR_CODES } from '@chat-export/protocol';
import { toProtocolError } from '../core/errors.js';

const Platform = z.enum(/** @type {[string, ...string[]]} */ ([...PLATFORMS]));
const ExportFormat = z.enum(/** @type {[string, ...string[]]} */ ([...EXPORT_FORMATS]));

const RETRYABLE_CODES = new Set([ERROR_CODES.TIMEOUT, ERROR_CODES.HOST_ERROR, ERROR_CODES.NOT_BOUND]);

function okResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function hintForError(code, platform) {
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

function detailedErrorBody(core, tool, err, ctx) {
  const pe = toProtocolError(err);
  const platform = ctx.platform || pe.details?.platform || null;
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

function detailedErrResult(core, tool, err, ctx) {
  const body = detailedErrorBody(core, tool, err, ctx);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }]
  };
}

function withDetailedMcpTool(tool, core, handler) {
  return async (args) => {
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

function registerDetailedTool(server, core, name, meta, handler) {
  server.registerTool(name, meta, withDetailedMcpTool(name, core, handler));
}

/**
 * Register MCP tools on an McpServer against ServerCore.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../core/server-core.js').ServerCore} core
 */
export function registerTools(server, core) {
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
        query: z.string().optional()
      }
    },
    async ({ platform, cursor, limit, query }) => {
      const args = {};
      if (cursor !== undefined) args.cursor = cursor;
      if (limit !== undefined) args.limit = limit;
      if (query !== undefined) args.query = query;
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
      const args = { text };
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
