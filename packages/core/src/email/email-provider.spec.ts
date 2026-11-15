import { describe, expect, it } from 'vitest';

import { SendGridEmailDriver } from '@dakly/providers/email/sendgrid/sendgrid-email-driver';
import { SmtpEmailDriver } from '@dakly/providers/email/smtp/smtp-email-driver';

import { loadEnv } from '../platform/config/env';
import { createEmailDriver } from './email-provider';

const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
describe('Email driver configuration', () => {
  it('uses Mailpit SMTP in development', () => {
    expect(createEmailDriver(loadEnv(base))).toBeInstanceOf(SmtpEmailDriver);
  });
  it.each([undefined, 'smtp', 'fake'])('refuses production email driver %s', (EMAIL_DRIVER) => {
    expect(() =>
      createEmailDriver(loadEnv({ ...base, NODE_ENV: 'production', EMAIL_DRIVER })),
    ).toThrow();
  });
  it('requires the SendGrid key and verified sender configuration', () => {
    expect(() =>
      createEmailDriver(loadEnv({ ...base, NODE_ENV: 'production', EMAIL_DRIVER: 'sendgrid' })),
    ).toThrow();
  });
  it('constructs SendGrid only with explicit production configuration', () => {
    expect(
      createEmailDriver(
        loadEnv({
          ...base,
          NODE_ENV: 'production',
          EMAIL_DRIVER: 'sendgrid',
          SENDGRID_API_KEY: 'test-only',
          EMAIL_FROM: 'auth@dakly.test',
        }),
      ),
    ).toBeInstanceOf(SendGridEmailDriver);
  });
});
