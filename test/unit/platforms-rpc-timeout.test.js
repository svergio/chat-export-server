import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS } from '@chat-export/protocol';
import {
  rpcTimeoutForArgs,
  SEND_RPC_TIMEOUT_MS,
  SEND_RPC_TIMEOUT_MAX_MS
} from '../../dist/core/attachments.js';

describe('PLATFORMS + send RPC timeout', () => {
  it('exposes eleven platforms', () => {
    assert.equal(PLATFORMS.length, 11);
    assert.ok(PLATFORMS.includes('qwen'));
    assert.ok(PLATFORMS.includes('deepseek'));
    assert.ok(PLATFORMS.includes('perplexity'));
    assert.ok(PLATFORMS.includes('kimi'));
    assert.ok(PLATFORMS.includes('zai'));
    assert.ok(PLATFORMS.includes('minimax'));
    assert.ok(!PLATFORMS.includes('janitorai'));
  });

  it('floors chats.send / chats.create timeout', () => {
    assert.equal(rpcTimeoutForArgs(60_000, {}, 'chats.send'), SEND_RPC_TIMEOUT_MS);
    assert.equal(rpcTimeoutForArgs(60_000, {}, 'chats.create'), SEND_RPC_TIMEOUT_MS);
    assert.equal(rpcTimeoutForArgs(60_000, { timeout_s: 180 }, 'chats.send'), 180_000);
    assert.equal(rpcTimeoutForArgs(60_000, { timeout_s: 400 }, 'chats.send'), SEND_RPC_TIMEOUT_MAX_MS);
  });
});
