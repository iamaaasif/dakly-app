import { describe, expect, it } from 'vitest';

import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { loadEnv } from '../platform/config/env';
import { createSmsDriver } from './sms-provider';

const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
describe('SMS consumer configuration', () => {
  it('fails closed in production when no real SMS driver is available', () => {
    expect(() => createSmsDriver(loadEnv({ ...base, NODE_ENV: 'production' }))).toThrow(
      'production SMS driver',
    );
  });
  it.each(['development', 'test'])('selects Mailpit only for %s', (NODE_ENV) => {
    expect(createSmsDriver(loadEnv({ ...base, NODE_ENV }))).toBeInstanceOf(MailpitSmsDriver);
  });
});
