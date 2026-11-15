import type { EmailDriver } from '@dakly/providers/email/email-driver';
import { SmtpEmailDriver } from '@dakly/providers/email/smtp/smtp-email-driver';
import { SendGridEmailDriver } from '@dakly/providers/email/sendgrid/sendgrid-email-driver';
import { type Env, loadEnv } from '../platform/config/env';

export const EMAIL_DRIVER = Symbol('EMAIL_DRIVER');
export function createEmailDriver(env: Env = loadEnv()): EmailDriver {
  if (env.NODE_ENV === 'production' && env.EMAIL_DRIVER !== 'sendgrid')
    throw new Error('Production requires EMAIL_DRIVER=sendgrid');
  if (env.EMAIL_DRIVER === 'sendgrid') {
    if (!env.SENDGRID_API_KEY || !env.EMAIL_FROM)
      throw new Error('SendGrid requires SENDGRID_API_KEY and EMAIL_FROM');
    return new SendGridEmailDriver({ apiKey: env.SENDGRID_API_KEY, from: env.EMAIL_FROM });
  }
  return new SmtpEmailDriver({
    host: env.MAILPIT_SMTP_HOST,
    port: env.MAILPIT_SMTP_PORT,
    from: env.EMAIL_FROM ?? 'auth@dakly.test',
  });
}
