import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION,
  PLATFORMS,
  OPS,
  DESTRUCTIVE_OPS,
  ERROR_CODES,
  ProtocolError,
  validate,
  validateOpResult,
  validateRpcRequest,
  validateRpcResponse
} from '../src/index.js';
import { fixture } from './helpers.js';

test('protocol version and platforms', () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.deepEqual([...PLATFORMS], ['chatgpt', 'grok', 'grok-x', 'copilot', 'claude']);
});

test('error codes include core contract set', () => {
  for (const code of [
    'PLATFORM_DISABLED',
    'NOT_BOUND',
    'CONFIRM_REQUIRED',
    'DESTRUCTIVE_DISABLED',
    'UNAUTHORIZED',
    'TIMEOUT',
    'HOST_ERROR',
    'NOT_FOUND',
    'CREATE_DISABLED',
    'PROJECTS_DISABLED'
  ]) {
    assert.equal(ERROR_CODES[code], code);
  }
});

test('container ops are registered', () => {
  for (const op of [
    'containers.list',
    'containers.chats',
    'containers.create',
    'containers.delete',
    'containers.move_chat'
  ]) {
    assert.ok(OPS.includes(op), op);
  }
  assert.ok(DESTRUCTIVE_OPS.includes('containers.delete'));
});

test('chats.list rpc round-trip from fixture', () => {
  const pairs = fixture('rpc.json');
  const row = pairs.find((p) => p.op === 'chats.list');
  assert.ok(row);
  assert.equal(validateRpcRequest(row.request).valid, true);
  assert.equal(validateRpcResponse(row.response, row.op).valid, true);
  assert.equal(validateOpResult('chats.list', row.response.data).valid, true);
});

test('ProtocolError carries code', () => {
  const err = new ProtocolError(ERROR_CODES.NOT_BOUND, 'x');
  assert.equal(err.code, ERROR_CODES.NOT_BOUND);
  assert.equal(validate('WsHello', { type: 'hello' }).valid, false);
});
