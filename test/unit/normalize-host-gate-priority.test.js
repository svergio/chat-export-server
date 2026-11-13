import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostGate, hasCaptchaEvidence } from '../../dist/core/platform-status.js';

describe('normalizeHostGate priority matrix', () => {
  it('generating beats false captcha and rate_limit', () => {
    assert.equal(
      normalizeHostGate({
        generating: true,
        code: 'CAPTCHA',
        state: 'captcha',
        banner: 'security check',
        composerReady: true
      }).state,
      'generating'
    );
    assert.equal(
      normalizeHostGate({
        generating: true,
        code: 'RATE_LIMIT',
        state: 'rate_limit',
        banner: 'Too many requests',
        composerReady: true
      }).state,
      'generating'
    );
  });

  it('usage remaining 0 maps to rate_limit quota when idle', () => {
    const g = normalizeHostGate({
      generating: false,
      composerReady: true,
      usage: { remaining: 0, limit: 50, unit: 'messages', plan: 'free', source: 'user_menu', confidence: 'high' }
    });
    assert.equal(g.state, 'rate_limit');
    assert.equal(g.kind, 'quota');
    assert.equal(g.usage.remaining, 0);
  });

  it('real captcha widget gates when idle', () => {
    assert.equal(
      hasCaptchaEvidence({
        challenge: { tag: 'iframe', src: 'https://challenges.cloudflare.com/x', vendor: 'turnstile' }
      }),
      true
    );
    const g = normalizeHostGate({
      generating: false,
      composerReady: false,
      code: 'CAPTCHA',
      state: 'captcha',
      kind: 'captcha',
      captchaWidget: { tag: 'iframe', src: 'https://challenges.cloudflare.com/x', vendor: 'turnstile' }
    });
    assert.equal(g.state, 'captcha');
    assert.equal(g.captchaWidget.vendor, 'turnstile');
  });
});
