import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ERROR_CODES, PLATFORMS } from '@chat-export/protocol';
import { ServerCore } from '../../dist/core/server-core.js';
import { updateSettings } from '../../dist/core/config.js';
import { tempHome } from '../helpers.js';

describe('platformsStatus disabled platforms', () => {
  it('returns state disabled for server-disabled platform without aborting the scan', async () => {
    const home = tempHome('ce-ps-');
    try {
      updateSettings(home, {
        platformsEnabled: PLATFORMS.filter((p) => p !== 'kimi')
      });
      const core = new ServerCore({
        home,
        hub: {
          isOnline: () => true,
          getBound: () => ({
            browserId: 'b-1',
            tabs: [{ platform: 'chatgpt', url: 'https://chatgpt.com' }],
            platformsEnabled: [...PLATFORMS],
            allowCreate: true,
            allowDestructive: false,
            allowProjects: true
          }),
          rpc: async ({ op, platform }) => {
            if (op === 'platform.host_state') {
              return {
                busy: false,
                generating: false,
                composerReady: true,
                platform
              };
            }
            return {};
          }
        }
      });
      const status = await core.platformsStatus({});
      assert.ok(status.platforms.length >= 2);
      const kimi = status.platforms.find((p) => p.platform === 'kimi');
      assert.ok(kimi);
      assert.equal(kimi.state, 'disabled');
      assert.equal(kimi.code, ERROR_CODES.PLATFORM_DISABLED);
      const chatgpt = status.platforms.find((p) => p.platform === 'chatgpt');
      assert.ok(chatgpt);
      assert.notEqual(chatgpt.state, 'disabled');
      core.close();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
