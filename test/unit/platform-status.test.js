import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHostGate,
  pickPlatformTargets,
  findLastPlatformAlert
} from '../../dist/core/platform-status.js';

describe('platform-status helpers', () => {
  it('normalizeHostGate prefers explicit state and maps busy codes', () => {
    assert.equal(
      normalizeHostGate({
        busy: true,
        code: 'RATE_LIMIT',
        kind: 'paywall',
        retryable: false,
        banner: 'Upgrade',
        generating: false,
        composerReady: true,
        state: 'rate_limit'
      }).state,
      'rate_limit'
    );
    assert.deepEqual(
      normalizeHostGate({
        busy: true,
        code: 'RATE_LIMIT',
        kind: 'quota',
        banner: 'Too many requests',
        generating: false,
        composerReady: true
      }),
      {
        state: 'rate_limit',
        code: 'RATE_LIMIT',
        kind: 'quota',
        retryable: true,
        banner: 'Too many requests',
        generating: false,
        composerReady: true
      }
    );
    assert.equal(normalizeHostGate({ busy: false, generating: true, composerReady: true }).state, 'generating');
    assert.equal(normalizeHostGate({ busy: false, generating: false, composerReady: false }).state, 'composer_blocked');
    assert.equal(normalizeHostGate({ busy: false, generating: false, composerReady: true }).state, 'ok');
  });

  it('pickPlatformTargets and findLastPlatformAlert', () => {
    assert.deepEqual(pickPlatformTargets('grok', ['chatgpt', 'grok']), ['grok']);
    assert.deepEqual(pickPlatformTargets(undefined, ['chatgpt', 'nope']), ['chatgpt']);
    assert.deepEqual(
      findLastPlatformAlert(
        [
          { platform: 'chatgpt', code: 'TIMEOUT', message: 'x', ts: '1' },
          { platform: 'perplexity', code: 'RATE_LIMIT', message: 'paywall', ts: '2' }
        ],
        'perplexity'
      ),
      { code: 'RATE_LIMIT', message: 'paywall', ts: '2' }
    );
    assert.equal(findLastPlatformAlert([{ platform: 'grok', code: 'TIMEOUT' }], 'grok'), null);
  });
});
