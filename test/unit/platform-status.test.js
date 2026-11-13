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
    const rate = normalizeHostGate({
      busy: true,
      code: 'RATE_LIMIT',
      kind: 'quota',
      banner: 'Too many requests',
      generating: false,
      composerReady: true
    });
    assert.equal(rate.state, 'rate_limit');
    assert.equal(rate.code, 'RATE_LIMIT');
    assert.equal(rate.kind, 'quota');
    assert.equal(rate.retryable, true);
    assert.equal(rate.banner, 'Too many requests');
    assert.equal(normalizeHostGate({ busy: false, generating: true, composerReady: true }).state, 'generating');
    assert.equal(normalizeHostGate({ busy: false, generating: false, composerReady: false }).state, 'composer_blocked');
    assert.equal(normalizeHostGate({ busy: false, generating: false, composerReady: true }).state, 'ok');
    const captcha = normalizeHostGate({
      busy: true,
      code: 'CAPTCHA',
      kind: 'captcha',
      banner: 'Verify you are human',
      generating: false,
      composerReady: true,
      challenge: { tag: 'iframe', src: 'https://hcaptcha.example/x', vendor: 'hcaptcha' }
    });
    assert.equal(captcha.state, 'captcha');
    assert.equal(captcha.code, 'CAPTCHA');
    assert.equal(captcha.retryable, false);
    assert.equal(
      normalizeHostGate({
        busy: true,
        code: 'CAPTCHA',
        kind: 'captcha',
        banner: 'security check in thinking',
        generating: true,
        composerReady: true
      }).state,
      'generating'
    );
    assert.equal(
      normalizeHostGate({
        busy: true,
        code: 'CAPTCHA',
        kind: 'captcha',
        banner: 'security check in thinking',
        generating: false,
        composerReady: true
      }).state,
      'ok'
    );
    assert.equal(
      normalizeHostGate({
        generating: false,
        composerReady: true,
        usage: { remaining: 0, limit: 50, unit: 'messages', plan: 'free', source: 'user_menu', confidence: 'high' }
      }).state,
      'rate_limit'
    );
    assert.equal(
      normalizeHostGate({
        busy: true,
        code: 'UNAUTHORIZED',
        kind: 'auth_wall',
        banner: 'Sign in',
        generating: false,
        composerReady: false
      }).state,
      'auth_wall'
    );
    assert.equal(
      normalizeHostGate({
        busy: false,
        generating: false,
        composerReady: true,
        code: null
      }).state,
      'ok'
    );
  });

  it('CN platform fixtures map captcha/rate_limit/auth_wall/ok', () => {
    for (const platform of ['kimi', 'zai', 'minimax']) {
      assert.equal(
        normalizeHostGate({
          busy: true,
          code: 'CAPTCHA',
          kind: 'captcha',
          banner: platform + ' captcha',
          generating: false,
          composerReady: true,
          captchaWidget: { tag: 'iframe', src: 'https://challenges.cloudflare.com/x', vendor: 'turnstile' }
        }).state,
        'captcha'
      );
      assert.equal(
        normalizeHostGate({
          busy: true,
          code: 'RATE_LIMIT',
          kind: 'quota',
          banner: platform + ' limited',
          generating: false,
          composerReady: true
        }).state,
        'rate_limit'
      );
      assert.equal(
        normalizeHostGate({
          busy: true,
          code: 'UNAUTHORIZED',
          kind: 'auth_wall',
          banner: platform + ' auth',
          generating: false,
          composerReady: false
        }).state,
        'auth_wall'
      );
      assert.equal(
        normalizeHostGate({
          busy: false,
          generating: false,
          composerReady: true
        }).state,
        'ok'
      );
    }
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
