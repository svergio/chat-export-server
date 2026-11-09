import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION,
  ERROR_CODES,
  ProtocolError,
  validate,
  assertValid,
  validateRpcRequest,
  validateRpcResponse,
  rpcOk,
  rpcError
} from '../src/index.js';
import { fixture, clone } from './helpers.js';

function paths(res) {
  return res.errors.map((e) => e.path + ' ' + e.message);
}

test('protocol version is 1', () => {
  assert.equal(PROTOCOL_VERSION, 1);
});

test('error codes include the contract set', () => {
  for (const code of [
    'PLATFORM_DISABLED',
    'NOT_BOUND',
    'CONFIRM_REQUIRED',
    'DESTRUCTIVE_DISABLED',
    'UNAUTHORIZED',
    'TIMEOUT',
    'HOST_ERROR',
    'NOT_FOUND'
  ]) {
    assert.equal(ERROR_CODES[code], code);
  }
});

test('Chat rejects unknown platform, missing fields, extra fields, bad date', () => {
  const chat = fixture('chats-list.json').items[0];
  assert.equal(validate('Chat', chat).valid, true);

  const badPlatform = { ...chat, platform: 'gemini' };
  assert.match(paths(validate('Chat', badPlatform))[0], /\$\.platform must be one of/);

  const { chatId, ...noId } = chat;
  assert.ok(paths(validate('Chat', noId)).includes('$.chatId is required'));

  assert.ok(paths(validate('Chat', { ...chat, extra: 1 })).includes('$.extra is not allowed'));
  assert.ok(paths(validate('Chat', { ...chat, updatedAt: 'yesterday' })).includes('$.updatedAt must be ISO 8601 date-time'));
  assert.equal(validate('Chat', { ...chat, updatedAt: null }).valid, true);
});

test('ExportPayload rejects bad message role and nested link errors with paths', () => {
  const payload = clone(fixture('export-payload-chatgpt.json'));
  payload.messages[0].role = 'bot';
  payload.messages[1].links[0] = { text: 'x' };
  const errs = paths(validate('ExportPayload', payload));
  assert.ok(errs.some((e) => e.startsWith('$.messages[0].role must be one of')));
  assert.ok(errs.includes('$.messages[1].links[0].href is required'));
});

test('ChatsListArgs: empty ok, limit bounds, integer only', () => {
  assert.equal(validate('ChatsListArgs', {}).valid, true);
  assert.equal(validate('ChatsListArgs', { cursor: 'abc', limit: 100, query: '' }).valid, true);
  assert.equal(validate('ChatsListArgs', { limit: 0 }).valid, false);
  assert.equal(validate('ChatsListArgs', { limit: 101 }).valid, false);
  assert.equal(validate('ChatsListArgs', { limit: 1.5 }).valid, false);
});

test('ChatsExportArgs: formats non-empty, unique, known', () => {
  assert.equal(validate('ChatsExportArgs', { chatId: '', formats: ['md'] }).valid, true);
  assert.equal(validate('ChatsExportArgs', { chatId: 'x', formats: [] }).valid, false);
  assert.equal(validate('ChatsExportArgs', { chatId: 'x', formats: ['md', 'md'] }).valid, false);
  assert.equal(validate('ChatsExportArgs', { chatId: 'x', formats: ['docx'] }).valid, false);
  assert.equal(validate('ChatsExportArgs', { formats: ['md'] }).valid, false);
});

test('ExportFile is text xor b64', () => {
  assert.equal(validate('ExportFile', { name: 'a.md', mime: 'text/markdown', text: '#' }).valid, true);
  assert.equal(validate('ExportFile', { name: 'a.pdf', mime: 'application/pdf', b64: 'AA==' }).valid, true);
  assert.equal(validate('ExportFile', { name: 'a', mime: 'x', text: '', b64: '' }).valid, false);
  assert.equal(validate('ExportFile', { name: 'a', mime: 'x' }).valid, false);
});

test('create and delete args/results', () => {
  assert.equal(validate('ChatsCreateArgs', { text: '' }).valid, false);
  assert.equal(validate('ChatsCreateArgs', { text: 'hi', title: 't' }).valid, true);
  assert.equal(validate('ChatsDeleteArgs', { chatId: '' }).valid, false);
  assert.equal(validate('ChatsDeleteResult', { deleted: true }).valid, true);
  assert.equal(validate('ChatsDeleteResult', { deleted: false }).valid, false);
});

test('validateRpcRequest checks envelope then per-op args', () => {
  assert.equal(validateRpcRequest({ id: '1', op: 'chats.list', platform: 'grok', args: {} }).valid, true);
  assert.equal(validateRpcRequest({ id: '1', op: 'chats.rename', platform: 'grok', args: {} }).valid, false);
  const res = validateRpcRequest({ id: '1', op: 'chats.delete', platform: 'grok', args: {} });
  assert.deepEqual(paths(res), ['$.args.chatId is required']);
});

test('validateRpcResponse checks envelope and op data', () => {
  assert.equal(validateRpcResponse(rpcOk('1', { anything: true })).valid, true);
  assert.equal(validateRpcResponse(rpcOk('1', { items: [] }), 'chats.list').valid, false);
  assert.equal(validateRpcResponse(rpcError('1', 'TIMEOUT', 'slow'), 'chats.list').valid, true);
  assert.equal(validateRpcResponse(rpcError('1', 'NOPE', 'x')).valid, false);
  assert.equal(validateRpcResponse({ id: '1', ok: true }).valid, false);
});

test('WsHello requires matching protocol version', () => {
  const hello = { ...fixture('ws-frames.json').WsHello, v: 2 };
  assert.ok(paths(validate('WsHello', hello)).includes('$.v must equal 1'));
});

test('assertValid throws ProtocolError BAD_REQUEST', () => {
  assert.throws(
    () => assertValid('ChatsGetArgs', {}),
    (err) => err instanceof ProtocolError && err.code === 'BAD_REQUEST' && /chatId is required/.test(err.message)
  );
  assert.deepEqual(new ProtocolError('NOT_FOUND', 'gone').toJSON(), { code: 'NOT_FOUND', message: 'gone' });
});

test('unknown schema name throws', () => {
  assert.throws(() => validate('Nope', {}), /Unknown schema/);
});
