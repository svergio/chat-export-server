import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryable } from '../../dist/core/jobs/lanes.js';
import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';

describe('isRetryable', () => {
  it('RATE_LIMIT alone is retryable', () => {
    assert.equal(isRetryable(new ProtocolError(ERROR_CODES.RATE_LIMIT, 'slow')), true);
  });

  it('details.retryable=false wins over RATE_LIMIT (paywall)', () => {
    assert.equal(
      isRetryable(
        new ProtocolError(ERROR_CODES.RATE_LIMIT, 'Бесплатный план', {
          retryable: false,
          kind: 'paywall'
        })
      ),
      false
    );
  });

  it('details.retryable=true is retryable', () => {
    assert.equal(
      isRetryable(new ProtocolError(ERROR_CODES.HOST_ERROR, 'tmp', { retryable: true })),
      true
    );
  });
});
