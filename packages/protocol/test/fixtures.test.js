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

const EXPORT_FIXTURE_PLATFORMS = PLATFORMS.filter((p) =>
  ['chatgpt', 'grok', 'grok-x', 'copilot'].includes(p)
);

test('export payload fixture exists and is valid for every platform', () => {
  for (const platform of EXPORT_FIXTURE_PLATFORMS) {
    const payload = fixture('export-payload-' + platform + '.json');
    assert.equal(payload.platform, platform);
    assertOk(validate('ExportPayload', payload), platform);
    assertOk(validateOpResult('chats.get', payload), platform);
  }
});

test('capabilities fixture exists and is valid for every platform', { skip: 'no capabilities-*.json fixtures in repo' }, () => {
  for (const platform of PLATFORMS) {
    const caps = fixture('capabilities-' + platform + '.json');
    assert.equal(caps.platform, platform);
    assertOk(validate('Capabilities', caps), platform);
    assertOk(validateOpResult('platform.capabilities', caps), platform);
    for (const group of ['models', 'modes', 'toggles', 'tools']) {
      const ids = caps[group].map((o) => o.id);
      assert.equal(new Set(ids).size, ids.length, platform + ' ' + group + ' ids unique');
      assert.ok(caps[group].every((o) => o.kind === group.slice(0, -1)), platform + ' ' + group + ' kind');
    }
    const known = (group, id) => caps[group].some((o) => o.id === id);
    if (caps.current.model) assert.ok(known('models', caps.current.model), platform + ' current.model');
    if (caps.current.mode) assert.ok(known('modes', caps.current.mode), platform + ' current.mode');
    for (const id of caps.current.toggles) assert.ok(known('toggles', id), platform + ' current.toggles');
  }
});

test('chats-create-extended: mcp form uses FileRef, wire form uses WireFile with matching size', {
  skip: 'chats-create-extended.json fixture not committed'
}, () => {
  const { mcp, wire } = fixture('chats-create-extended.json');
  assertOk(validate('McpChatsCreateArgs', mcp), 'mcp');
  assertOk(validate('ChatsCreateArgs', wire), 'wire');
  assert.equal(validate('ChatsCreateArgs', mcp).valid, false);
  assert.equal(validate('McpChatsCreateArgs', wire).valid, false);
  for (const f of wire.files) assert.equal(Buffer.from(f.b64, 'base64').length, f.size, f.name);
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
