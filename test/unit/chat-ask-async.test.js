import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clampAskTimeout } from '../../dist/core/jobs/job-manager.js';

describe('chat_ask timeout clamp', () => {
  it('defaults invalid values to 90s and clamps to [10, 300]', () => {
    assert.equal(clampAskTimeout(undefined), 90);
    assert.equal(clampAskTimeout('x'), 90);
    assert.equal(clampAskTimeout(5), 10);
    assert.equal(clampAskTimeout(15), 15);
    assert.equal(clampAskTimeout(300), 300);
    assert.equal(clampAskTimeout(400), 300);
  });
});
