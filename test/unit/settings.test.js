import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import {
  assertPlatformEnabled,
  assertDestructiveAllowed,
  mergePlatformsList
} from '../../dist/core/settings.js';

describe('settings gates', () => {
  const serverAll = {
    platformsEnabled: ['chatgpt', 'grok', 'grok-x', 'copilot', 'claude'],
    allowDestructive: false
  };

  it('PLATFORM_DISABLED when server or browser disables platform', () => {
    assert.throws(
      () =>
        assertPlatformEnabled('chatgpt', { platformsEnabled: ['grok'] }, {
          platformsEnabled: ['chatgpt']
        }),
      (e) => e instanceof ProtocolError && e.code === ERROR_CODES.PLATFORM_DISABLED
    );
    assert.throws(
      () =>
        assertPlatformEnabled('chatgpt', serverAll, {
          platformsEnabled: ['grok']
        }),
      (e) => e instanceof ProtocolError && e.code === ERROR_CODES.PLATFORM_DISABLED
    );
    assert.doesNotThrow(() =>
      assertPlatformEnabled('chatgpt', serverAll, { platformsEnabled: ['chatgpt'] })
    );
  });

  it('CONFIRM_REQUIRED and DESTRUCTIVE_DISABLED', () => {
    assert.throws(
      () => assertDestructiveAllowed('chats.delete', { allowDestructive: true }, { allowDestructive: true }, {}),
      (e) => e.code === ERROR_CODES.CONFIRM_REQUIRED
    );
    assert.throws(
      () =>
        assertDestructiveAllowed(
          'chats.delete',
          { allowDestructive: false },
          { allowDestructive: true },
          { confirm: true }
        ),
      (e) => e.code === ERROR_CODES.DESTRUCTIVE_DISABLED
    );
    assert.throws(
      () =>
        assertDestructiveAllowed(
          'chats.delete',
          { allowDestructive: true },
          { allowDestructive: false },
          { confirm: true }
        ),
      (e) => e.code === ERROR_CODES.DESTRUCTIVE_DISABLED
    );
    assert.doesNotThrow(() =>
      assertDestructiveAllowed(
        'chats.delete',
        { allowDestructive: true },
        { allowDestructive: true },
        { confirm: true }
      )
    );
    assert.doesNotThrow(() =>
      assertDestructiveAllowed('chats.list', { allowDestructive: false }, { allowDestructive: false }, {})
    );
  });

  it('mergePlatformsList', () => {
    const list = mergePlatformsList(
      { platformsEnabled: ['chatgpt', 'grok'] },
      { platformsEnabled: ['chatgpt'] }
    );
    const chatgpt = list.find((p) => p.id === 'chatgpt');
    const grok = list.find((p) => p.id === 'grok');
    assert.equal(chatgpt.enabled, true);
    assert.equal(grok.enabled, false);
    assert.equal(grok.serverEnabled, true);
    assert.equal(grok.browserEnabled, false);
  });
});
