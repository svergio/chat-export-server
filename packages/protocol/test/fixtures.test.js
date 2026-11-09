import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLATFORMS,
  OPS,
  schema,
  validate,
  validateRpcRequest,
  validateRpcResponse,
  validateOpResult
} from '../src/index.js';
import { fixture } from './helpers.js';

function assertOk(res, label) {
  assert.equal(res.valid, true, label + ': ' + JSON.stringify(res.errors));
}

test('chat list fixtures are valid ChatsListResult', () => {
  for (const name of ['chats-list.json', 'chats-list-grok.json']) {
    assertOk(validateOpResult('chats.list', fixture(name)), name);
  }
});

test('export payload fixture exists and is valid for every platform', () => {
  for (const platform of PLATFORMS) {
    const payload = fixture('export-payload-' + platform + '.json');
    assert.equal(payload.platform, platform);
    assertOk(validate('ExportPayload', payload), platform);
    assertOk(validateOpResult('chats.get', payload), platform);
  }
});

test('ws frame fixtures are valid', () => {
  const frames = fixture('ws-frames.json');
  for (const [def, frame] of Object.entries(frames)) assertOk(validate(def, frame), def);
});

test('rpc fixtures cover every op and validate request + response', () => {
  const pairs = fixture('rpc.json');
  assert.deepEqual([...new Set(pairs.map((p) => p.op))].sort(), [...OPS].sort());
  for (const { op, request, response } of pairs) {
    assertOk(validateRpcRequest(request), request.id + ' request');
    assertOk(validateRpcResponse(response, op), response.id + ' response');
  }
});

test('emitted schemas/protocol.schema.json is in sync with src/schema.js', () => {
  const file = JSON.parse(readFileSync(new URL('../schemas/protocol.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(file, JSON.parse(JSON.stringify(schema)), 'run: npm run schema');
});
