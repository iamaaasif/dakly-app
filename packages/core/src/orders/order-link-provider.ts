import type { BotCheckDriver } from '@dakly/providers/bot-check/bot-check-driver';
import { FakeBotCheckDriver } from '@dakly/providers/bot-check/fake-bot-check-driver';
import { TurnstileDriver } from '@dakly/providers/bot-check/turnstile-driver';

import { loadEnv, type Env } from '../platform/config/env';

export const BOT_CHECK_DRIVER = Symbol('BOT_CHECK_DRIVER');

// Without keys, production has no bot check, so the public link stays closed instead of open.
export function createBotCheckDriver(env: Env = loadEnv()): BotCheckDriver | null {
  if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
    return new TurnstileDriver(env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY);
  return env.NODE_ENV === 'production' ? null : new FakeBotCheckDriver();
}
