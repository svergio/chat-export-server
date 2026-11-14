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
  assert.deepEqual(
    [...PLATFORMS],
    [
      'chatgpt',
      'grok',
      'grok-x',
      'copilot',
      'claude',
      'qwen',
      'deepseek',
      'perplexity',
      'kimi',
      'zai',
      'minimax'
    ]
  );
  assert.equal(PLATFORMS.includes('janitorai'), false);
  assert.equal(validate('Platform', 'janitorai').valid, false);
  for (const id of ['kimi', 'zai', 'minimax']) {
    assert.equal(validate('Platform', id).valid, true, id);
  }
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
    'PROJECTS_DISABLED',
    'PLATFORM_BUSY',
    'RATE_LIMIT',
    'CAPTCHA',
    'OPTION_NOT_FOUND',
    'OPTION_LOCKED',
    'ATTACH_UNSUPPORTED',
    'FILE_NOT_ALLOWED',
    'FILE_TOO_LARGE',
    'ATTACH_TIMEOUT'
  ]) {
    assert.equal(ERROR_CODES[code], code);
  }
});

test('rpc.response accepts PROJECTS_DISABLED and OPTION_NOT_FOUND errors', () => {
  for (const code of ['PROJECTS_DISABLED', 'OPTION_NOT_FOUND']) {
    assert.equal(
      validate('RpcResponse', {
        type: 'rpc.result',
        id: 'x1',
        ok: false,
        error: { code, message: 'Projects are not supported' }
      }).valid,
      true,
      code
    );
  }
});

test('platform.host_state accepts captcha gate fields', () => {
  assert.equal(
    validateOpResult('platform.host_state', {
      platform: 'chatgpt',
      generating: false,
      busy: true,
      banner: 'Verify you are human',
      composerReady: true,
      code: 'CAPTCHA',
      kind: 'captcha',
      retryable: false,
      state: 'captcha'
    }).valid,
    true
  );
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

test('tabs.ensure rpc request/result validate', () => {
  assert.ok(OPS.includes('tabs.ensure'));
  const req = {
    id: 't1',
    op: 'tabs.ensure',
    platform: 'chatgpt',
    args: {}
  };
  assert.equal(validateRpcRequest(req).valid, true);
  assert.equal(
    validateOpResult('tabs.ensure', {
      tabId: 42,
      platform: 'chatgpt',
      url: 'https://chatgpt.com/',
      chatId: '',
      title: 'ChatGPT',
      active: false,
      created: true
    }).valid,
    true
  );
  assert.equal(
    validateOpResult('tabs.ensure', {
      tabId: 42,
      platform: 'chatgpt',
      url: 'https://chatgpt.com/',
      chatId: '',
      title: 'ChatGPT',
      active: false
    }).valid,
    false
  );
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

test('WsHello accepts exportSchemas from extension hello', () => {
  const hello = {
    type: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    key: 'ceb_29b9204cbtest',
    browserId: 'b-5b508c84',
    browserLabel: 'Chrome',
    extVersion: '1.7.0',
    platformsEnabled: [...PLATFORMS],
    allowCreate: true,
    allowDestructive: false,
    allowProjects: true,
    exportSchemas: {
      default: 'chat-export/1',
      byFormat: { md: null, yaml: null, json: null, html: null, pdf: null }
    },
    exportSchemaIds: ['chat-export/1', 'sharegpt/1'],
    tabs: []
  };
  assert.equal(validate('WsHello', hello).valid, true);
  assert.equal(
    validate('WsSettings', {
      type: 'settings',
      platformsEnabled: ['chatgpt'],
      allowCreate: true,
      allowDestructive: false,
      allowProjects: true,
      browserLabel: 'Chrome',
      exportSchemas: hello.exportSchemas,
      exportSchemaIds: hello.exportSchemaIds
    }).valid,
    true
  );
});
