import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BROWSER_TOKEN_PREFIX,
  LEGACY_BROWSER_TOKEN_PREFIX,
  MCP_TOKEN_PREFIX,
  fingerprintOf,
  generateBrowserToken,
  generateMcpToken,
  hashKey,
  isBrowserToken,
  isMcpToken,
  verifyKey
} from '../../dist/core/keys.js';

describe('token helpers', () => {
  it('generates cem_ and ceb_ tokens', () => {
    const mcp = generateMcpToken();
    const browser = generateBrowserToken();
    assert.ok(mcp.startsWith(MCP_TOKEN_PREFIX));
    assert.ok(browser.startsWith(BROWSER_TOKEN_PREFIX));
    assert.equal(mcp.length, 52);
    assert.equal(browser.length, 52);
    assert.ok(isMcpToken(mcp));
    assert.ok(isBrowserToken(browser));
    assert.equal(isMcpToken(browser), false);
    assert.equal(isBrowserToken(mcp), false);
    assert.ok(isBrowserToken(LEGACY_BROWSER_TOKEN_PREFIX + 'b'.repeat(48)));
  });

  it('hashKey + verifyKey round-trip', () => {
    const token = generateBrowserToken();
    const rec = hashKey(token);
    assert.equal(rec.fingerprint, fingerprintOf(token));
    assert.ok(verifyKey(token, rec));
    assert.equal(verifyKey(token + 'x', rec), false);
    assert.equal(verifyKey(token, { salt: rec.salt, hash: '00' }), false);
  });
});
