import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { ServerCore } from '../../dist/core/server-core.js';
import { PACKAGE_VERSION, readPackageVersion } from '../../dist/core/pkg-version.js';
import { tempHome } from '../helpers.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

describe('pkg-version / ServerCore.serverVersion', () => {
  it('readPackageVersion matches package.json', () => {
    assert.equal(readPackageVersion(), pkg.version);
    assert.equal(PACKAGE_VERSION, pkg.version);
  });

  it('ServerCore defaults serverVersion from package.json when omitted', () => {
    const home = tempHome('ce-ver-');
    try {
      const core = new ServerCore({ home });
      assert.equal(core.serverVersion, pkg.version);
      assert.notEqual(core.serverVersion, '1.0.1');
      core.close();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
