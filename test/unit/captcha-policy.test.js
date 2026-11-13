import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '@chat-export/protocol';
import {
  enforceCaptchaPolicy,
  hostEnvelope,
  isCaptchaGate,
  parseOnCaptcha,
  stripCaptchaArgs
} from '../../dist/core/captcha-policy.js';

describe('captcha-policy', () => {
  it('parseOnCaptcha defaults to stop and rejects unknowns', () => {
    assert.equal(parseOnCaptcha(undefined), 'stop');
    assert.equal(parseOnCaptcha('wait_human'), 'wait_human');
    assert.throws(() => parseOnCaptcha('solve'), (e) => e.code === ERROR_CODES.INVALID_ARGS);
  });

  it('isCaptchaGate and hostEnvelope map captcha host_state', () => {
    const host = {
      busy: true,
      code: 'CAPTCHA',
      kind: 'captcha',
      state: 'captcha',
      banner: 'Verify you are human',
      generating: false,
      composerReady: true,
      challenge: { src: 'https://hcaptcha.example/x', tag: 'iframe' }
    };
    assert.equal(isCaptchaGate(host), true);
    assert.equal(isCaptchaGate({ busy: true, code: 'PLATFORM_BUSY' }), false);
    const env = hostEnvelope(host);
    assert.equal(env.state, 'captcha');
    assert.equal(env.retryable, false);
    assert.equal(env.challenge.src, 'https://hcaptcha.example/x');
  });

  it('stop and allow_agent throw non-retryable CAPTCHA without sending', async () => {
    const host = {
      busy: true,
      code: 'CAPTCHA',
      kind: 'captcha',
      state: 'captcha',
      banner: 'captcha',
      generating: false,
      composerReady: false
    };
    await assert.rejects(
      () =>
        enforceCaptchaPolicy({
          platform: 'grok',
          onCaptcha: 'stop',
          fetchHost: async () => host
        }),
      (e) => e.code === ERROR_CODES.CAPTCHA && e.details.retryable === false && e.details.allowAgentCaptcha === false
    );
    await assert.rejects(
      () =>
        enforceCaptchaPolicy({
          platform: 'grok',
          onCaptcha: 'allow_agent',
          fetchHost: async () => host
        }),
      (e) => e.code === ERROR_CODES.CAPTCHA && e.details.allowAgentCaptcha === true
    );
  });

  it('wait_human polls until captcha clears and does not send while blocked', async () => {
    let calls = 0;
    const sleeps = [];
    const host = await enforceCaptchaPolicy({
      platform: 'chatgpt',
      onCaptcha: 'wait_human',
      pollMs: 10,
      timeoutMs: 1000,
      now: (() => {
        let t = 0;
        return () => t;
      })(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchHost: async () => {
        calls += 1;
        if (calls < 3) {
          return {
            busy: true,
            code: 'CAPTCHA',
            kind: 'captcha',
            state: 'captcha',
            banner: 'captcha',
            generating: false,
            composerReady: false
          };
        }
        return {
          busy: false,
          code: null,
          kind: null,
          state: 'ok',
          banner: null,
          generating: false,
          composerReady: true
        };
      }
    });
    assert.equal(host.state, 'ok');
    assert.equal(calls, 3);
    assert.ok(sleeps.length >= 1);
  });

  it('stripCaptchaArgs removes policy fields from wire args', () => {
    const { wire, onCaptcha, ensureTab } = stripCaptchaArgs({
      chatId: 'c1',
      text: 'hi',
      onCaptcha: 'wait_human',
      ensureTab: true
    });
    assert.equal(onCaptcha, 'wait_human');
    assert.equal(ensureTab, true);
    assert.deepEqual(wire, { chatId: 'c1', text: 'hi' });
  });
});
