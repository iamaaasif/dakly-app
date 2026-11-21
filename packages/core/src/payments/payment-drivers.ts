import { BkashPaymentDriver } from '@dakly/providers/payment/bkash/bkash-payment-driver';
import type { PaymentDriver } from '@dakly/providers/payment/payment-driver';

import type { Env } from '../platform/config/env';

export const PAYMENT_DRIVERS = Symbol('PAYMENT_DRIVERS');

// Dakly's own bKash account is optional: without it only shop credentials can pay through bKash.
export function buildPaymentDrivers(env: Env): PaymentDriver[] {
  const { BKASH_BILLING_APP_KEY: appKey, BKASH_BILLING_APP_SECRET: appSecret } = env;
  const { BKASH_BILLING_USERNAME: username, BKASH_BILLING_PASSWORD: password } = env;
  const billing =
    appKey && appSecret && username && password
      ? {
          mode: env.BKASH_BILLING_MODE ?? 'sandbox',
          credentials: { appKey, appSecret, username, password },
        }
      : undefined;
  return [new BkashPaymentDriver({ billing })];
}
