import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildChatOutline, buildChatRead, lastAssistantReply } from '../../dist/core/chat-views.js';

const payload = {
  platform: 'claude',
  chatId: 'c1',
  title: 't',
  messages: [
    { role: 'user', text: 'hello world from user' },
    { role: 'assistant', text: 'a'.repeat(5000), thinkingChars: 120 },
    { role: 'user', text: 'next' },
    { role: 'assistant', text: 'done' }
  ]
};

describe('chat-views', () => {
  it('buildChatOutline previews without full text', () => {
    const out = buildChatOutline(payload, { previewChars: 40 });
    assert.equal(out.total, 4);
    assert.equal(out.turns[1].thinkingChars, 120);
    assert.ok(out.turns[1].preview.length <= 40);
    assert.ok(!('text' in out.turns[1]));
  });

  it('buildChatRead slices and truncates', () => {
    const out = buildChatRead(payload, { start: 1, end: 1, maxChars: 200 });
    assert.equal(out.turns.length, 1);
    assert.equal(out.turns[0].i, 1);
    assert.equal(out.turns[0].truncated, true);
    assert.equal(out.turns[0].text.length, 200);
    assert.equal(out.next, 2);
  });

  it('buildChatRead accepts negative start/end', () => {
    const out = buildChatRead(payload, { start: -1, end: -1, maxChars: 500 });
    assert.equal(out.turns.length, 1);
    assert.equal(out.turns[0].i, 3);
    assert.equal(out.turns[0].text, 'done');
    assert.equal(out.next, null);
  });

  it('lastAssistantReply finds last assistant', () => {
    const { reply, after } = lastAssistantReply(payload);
    assert.equal(reply.text, 'done');
    assert.equal(after, 3);
  });
});
