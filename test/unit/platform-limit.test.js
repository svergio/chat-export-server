import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { ServerCore } from '../../dist/core/server-core.js';
import { readAuditLines } from '../../dist/core/audit.js';
import { tempHome } from '../helpers.js';
import fs from 'node:fs';

describe('platform limit signals', () => {
  it('logMcpToolResult audits platform.limit for RATE_LIMIT and auth_wall', () => {
    const home = tempHome('ce-limit-');
    try {
      const core = new ServerCore({ home });
      core.logMcpToolResult('chat_ask', {
        platform: 'perplexity',
        duration_ms: 12,
        ok: false,
        code: ERROR_CODES.RATE_LIMIT,
        message: 'Upgrade to Pro',
        detail: { kind: 'paywall', banner: 'Upgrade to Pro', retryable: false }
      });
      core.logMcpToolResult('chats_send', {
        platform: 'perplexity',
        duration_ms: 8,
        ok: false,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Sign up and repeat',
        detail: { kind: 'auth_wall', banner: 'Sign up and repeat', retryable: false }
      });
      core.logMcpToolResult('browsers_list', {
        platform: null,
        duration_ms: 1,
        ok: false,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'bad token'
      });

      const lines = readAuditLines(core.config.paths.audit);
      const limits = lines.filter((l) => l.action === 'platform.limit');
      assert.equal(limits.length, 2);
      assert.equal(limits[0].code, ERROR_CODES.RATE_LIMIT);
      assert.equal(limits[0].kind, 'paywall');
      assert.equal(limits[0].platform, 'perplexity');
      assert.equal(limits[1].code, ERROR_CODES.UNAUTHORIZED);
      assert.equal(limits[1].kind, 'auth_wall');
      assert.ok(String(limits[0].source || '').startsWith('mcp:'));
      core.close();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('callOp failure audits platform.limit with details.kind', async () => {
    const home = tempHome('ce-limit-rpc-');
    try {
      const core = new ServerCore({
        home,
        hub: {
          getBound: () => ({
            browserId: 'b-1',
            tabs: [],
            platformsEnabled: ['chatgpt'],
            allowCreate: true,
            allowDestructive: true,
            allowProjects: true
          }),
          rpc: async () => {
            throw new ProtocolError(ERROR_CODES.RATE_LIMIT, 'Too many requests', {
              kind: 'quota',
              banner: 'Too many requests',
              retryable: true
            });
          }
        }
      });
      core.acceptAdvancedMcpTos();
      await assert.rejects(
        () => core.callOp('chats.send', 'chatgpt', { chatId: 'c1', text: 'hi' }),
        (err) => err.code === ERROR_CODES.RATE_LIMIT
      );
      const lines = readAuditLines(core.config.paths.audit);
      const hit = lines.find((l) => l.action === 'platform.limit' && l.source === 'rpc:chats.send');
      assert.ok(hit);
      assert.equal(hit.kind, 'quota');
      assert.equal(hit.browserId, 'b-1');
      core.close();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
