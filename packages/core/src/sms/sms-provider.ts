import type { SmsDriver } from '@dakly/providers/sms/sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { type Env, loadEnv } from '../platform/config/env';

export const SMS_DRIVER = Symbol('SMS_DRIVER');

export function createSmsDriver(env: Env = loadEnv()): SmsDriver {
  if (env.NODE_ENV === 'production') {
    throw new Error('A usable production SMS driver is required; configure it when ACC-14 ships');
  }
  return new MailpitSmsDriver({ host: env.MAILPIT_SMTP_HOST, port: env.MAILPIT_SMTP_PORT });
}
