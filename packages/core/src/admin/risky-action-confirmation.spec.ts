import { randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEnvForTests } from '../platform/config/env';
import { RiskyActionConfirmation } from './risky-action-confirmation';

describe('RiskyActionConfirmation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it('gives the same signature for the same effect in a different key order', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
    resetEnvForTests();
    const confirmation = new RiskyActionConfirmation();
    const effect = {
      action: 'support.break_glass_opened',
      scopes: ['customers'],
      target: { storeId: 'store-1', reason: 'Owner locked out' },
    };
    const reordered = {
      target: { reason: 'Owner locked out', storeId: 'store-1' },
      scopes: ['customers'],
      action: 'support.break_glass_opened',
    };
    expect(confirmation.sign(reordered)).toBe(confirmation.sign(effect));
    expect(() => confirmation.verify(reordered, confirmation.sign(effect))).not.toThrow();
  });
});
