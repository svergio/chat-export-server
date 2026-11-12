import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { withServer } from '../helpers.js';
import { clearPidFile, readPidFile, writePidFile } from '../../dist/core/pid-file.js';

async function login(port, username = 'admin', password = 'changeme') {
  const res = await fetch(`http://127.0.0.1:${port}/dashboard/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader =
    setCookie.map((c) => c.split(';')[0]).join('; ') ||
    String(res.headers.get('set-cookie') || '')
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(cookieHeader.includes('ce_dash_sid='));
  return { cookie: cookieHeader, body };
}

describe('dashboard api confirm gates', () => {
  it('session restore uses /session username; cancel/rotate require confirm:true', async () => {
    await withServer(async (server) => {
      const port = server.port;
      const { cookie, body: loginBody } = await login(port, 'admin', 'changeme');
      assert.equal(loginBody.username, 'admin');

      const sessionRes = await fetch(`http://127.0.0.1:${port}/dashboard/api/session`, {
        headers: { Cookie: cookie }
      });
      const session = await sessionRes.json();
      assert.equal(sessionRes.status, 200);
      assert.equal(session.username, 'admin');

      const cancelNoConfirm = await fetch(`http://127.0.0.1:${port}/dashboard/api/jobs/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ jobId: 'missing' })
      });
      const cancelNoBody = await cancelNoConfirm.json();
      assert.equal(cancelNoConfirm.status, 400);
      assert.equal(cancelNoBody.error?.code, 'CONFIRM_REQUIRED');

      const rotateNoConfirm = await fetch(`http://127.0.0.1:${port}/dashboard/api/mcp-token/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({})
      });
      const rotateNoBody = await rotateNoConfirm.json();
      assert.equal(rotateNoConfirm.status, 400);
      assert.equal(rotateNoBody.error?.code, 'CONFIRM_REQUIRED');

      const rotateOk = await fetch(`http://127.0.0.1:${port}/dashboard/api/mcp-token/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ confirm: true })
      });
      const rotated = await rotateOk.json();
      assert.equal(rotateOk.status, 200);
      assert.ok(String(rotated.token || '').startsWith('cem_'));

      const browsersRes = await fetch(`http://127.0.0.1:${port}/dashboard/api/browsers`, {
        headers: { Cookie: cookie }
      });
      const browsers = await browsersRes.json();
      assert.equal(browsersRes.status, 200);
      assert.equal(typeof browsers.serverSettings?.allowDestructive, 'boolean');
      assert.ok(Array.isArray(browsers.serverSettings?.platformsEnabled));

      const pidPath = path.join(server.core.config.home, 'server.pid');
      assert.equal(readPidFile(pidPath), process.pid);
    });
  });
});

describe('pid-file', () => {
  it('refreshes pid without killing a foreign live process and only clears own pid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-pid-'));
    const pidPath = path.join(dir, 'server.pid');
    try {
      fs.writeFileSync(pidPath, `${process.pid}\n`);
      const info = writePidFile(pidPath, process.pid);
      assert.equal(info.previousPid, process.pid);
      assert.equal(info.warnedLiveForeign, false);
      assert.equal(readPidFile(pidPath), process.pid);

      clearPidFile(pidPath, process.pid + 999999);
      assert.equal(readPidFile(pidPath), process.pid);

      clearPidFile(pidPath, process.pid);
      assert.equal(readPidFile(pidPath), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
