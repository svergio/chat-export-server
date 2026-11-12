import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBearer } from '../../dist/mcp/http.js';
import { withServer } from '../helpers.js';

describe('MCP HTTP auth edges', () => {
  it('extractBearer rejects missing, huge, and malformed headers', () => {
    assert.equal(extractBearer({ headers: {} }), null);
    assert.equal(extractBearer({ headers: { authorization: 'Token dead' } }), null);
    assert.equal(extractBearer({ headers: { authorization: 'Bearer' } }), null);
    const huge = 'Bearer ' + 'a'.repeat(5000);
    assert.equal(extractBearer({ headers: { authorization: huge } }), null);
    assert.equal(extractBearer({ headers: { authorization: 'Bearer cem_valid' } }), 'cem_valid');
  });

  it('/mcp returns 401 for invalid bearer without starting session', async () => {
    await withServer(async (srv) => {
      const res = await fetch(`http://127.0.0.1:${srv.port}/mcp`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer cem_deadbeef',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} })
      });
      assert.equal(res.status, 401);
    });
  });
});
