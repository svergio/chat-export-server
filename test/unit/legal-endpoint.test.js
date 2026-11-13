import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../dist/server.js';

describe('server /health and /legal endpoints', () => {
  it('serves /health and /legal metadata', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-legal-test-'));
    const srv = await startServer({ home: tmpHome, host: '127.0.0.1', port: 0 });
    try {
      const baseUrl = `http://127.0.0.1:${srv.port}`;
      const healthRes = await fetch(`${baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.equal(healthJson.ok, true);
      assert.equal(healthJson.legal, '/legal');

      const legalRes = await fetch(`${baseUrl}/legal`);
      assert.equal(legalRes.status, 200);
      const legalJson = await legalRes.json();
      assert.equal(legalJson.ok, true);
      assert.equal(legalJson.license, 'MIT');
      assert.equal(legalJson.document, 'LEGAL.md');
      assert.equal(legalJson.localFirst, true);
      assert.ok(legalJson.issues?.server?.includes('chat-export-server/issues'));
      assert.ok(legalJson.issues?.extension?.includes('chat-export-extension/issues'));
      assert.equal(legalJson.advancedMcpTosAccepted, false);

      const acceptRes = await fetch(`${baseUrl}/legal/accept`, { method: 'POST' });
      assert.equal(acceptRes.status, 200);
      const acceptJson = await acceptRes.json();
      assert.equal(acceptJson.ok, true);
      assert.equal(acceptJson.advancedMcpTosAccepted, true);
      assert.ok(acceptJson.advancedMcpTosAcceptedAt);

      const legal2 = await (await fetch(`${baseUrl}/legal`)).json();
      assert.equal(legal2.advancedMcpTosAccepted, true);
    } finally {
      await srv.close();
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
