import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPlatformSlots,
  applySlotFromBody,
  isUnsupportedSoftFail
} from '../../scripts/mcp-run-list.mjs';

test('clearPlatformSlots drops chat/cache/container, keeps browserId', () => {
  const next = clearPlatformSlots({
    browserId: 'b-1',
    chatId: 'c1',
    chatId2: 'c2',
    cacheId: 'k1',
    containerId: 'p1',
    lastJobId: 'j1'
  });
  assert.equal(next.browserId, 'b-1');
  assert.equal(next.lastJobId, 'j1');
  assert.equal(next.chatId, undefined);
  assert.equal(next.cacheId, undefined);
  assert.equal(next.containerId, undefined);
});

test('applySlotFromBody sets and clears chatId on empty body', () => {
  let slots = applySlotFromBody({}, 'chatId', { chatId: 'abc' });
  assert.equal(slots.chatId, 'abc');
  slots = applySlotFromBody(slots, 'chatId', {});
  assert.equal(slots.chatId, undefined);
});

test('isUnsupportedSoftFail covers PROJECTS_DISABLED', () => {
  assert.equal(isUnsupportedSoftFail('PROJECTS_DISABLED', 'Projects are not supported'), true);
  assert.equal(isUnsupportedSoftFail('OPTION_NOT_FOUND', 'nope'), true);
  assert.equal(isUnsupportedSoftFail('NOT_FOUND', 'conversation missing'), false);
});
