import { z } from 'zod';
import { PLATFORMS, EXPORT_FORMATS } from '@chat-export/protocol';
import { errorToJson } from '../core/errors.js';

const Platform = z.enum(/** @type {[string, ...string[]]} */ ([...PLATFORMS]));
const ExportFormat = z.enum(/** @type {[string, ...string[]]} */ ([...EXPORT_FORMATS]));

function okResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function errResult(err) {
  const body = errorToJson(err);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }]
  };
}

/**
 * Register MCP tools on an McpServer against ServerCore.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../core/server-core.js').ServerCore} core
 */
export function registerTools(server, core) {
  server.registerTool(
    'browsers_list',
    {
      description: 'List browsers (Chrome profiles) connected via the Chat Export extension.',
      inputSchema: {}
    },
    async () => {
      try {
        return okResult({ browsers: core.browsersList() });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    'browsers_bind',
    {
      description: 'Bind subsequent chat ops to a connected browserId.',
      inputSchema: {
        browserId: z.string().min(1).describe('browserId from browsers_list')
      }
    },
    async ({ browserId }) => {
      try {
        return okResult(core.browsersBind(browserId));
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    'browsers_status',
    {
      description: 'Show bound browser and connection status.',
      inputSchema: {}
    },
    async () => {
      try {
        return okResult(core.browsersStatus());
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    'platforms_list',
    {
      description: 'List platforms and whether they are enabled on server and bound browser.',
      inputSchema: {}
    },
    async () => {
      try {
        return okResult(core.platformsList());
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
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
      try {
        const args = {};
        if (cursor !== undefined) args.cursor = cursor;
        if (limit !== undefined) args.limit = limit;
        if (query !== undefined) args.query = query;
        return okResult(await core.chatsList(platform, args));
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    'chats_get',
    {
      description: 'Get one chat as ExportPayload. Empty chatId means the open tab.',
      inputSchema: {
        platform: Platform,
        chatId: z.string().describe('chat id, or empty string for current tab')
      }
    },
    async ({ platform, chatId }) => {
      try {
        return okResult(await core.chatsGet(platform, { chatId }));
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
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
    async ({ platform, chatId, formats }) => {
      try {
        return okResult(await core.chatsExport(platform, { chatId, formats }));
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
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
      try {
        const args = { text };
        if (title !== undefined) args.title = title;
        return okResult(await core.chatsCreate(platform, args));
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
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
    async ({ platform, chatId, confirm }) => {
      try {
        return okResult(await core.chatsDelete(platform, { chatId }, { confirm }));
      } catch (err) {
        return errResult(err);
      }
    }
  );
}
