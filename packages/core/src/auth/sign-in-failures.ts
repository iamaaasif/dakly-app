import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SmsDriver } from '@dakly/providers/sms/sms-driver';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import { SMS_DRIVER } from './sms-provider';

export type SignInSubject = { userId?: string; target: string; phone?: string };
const RECORD_FAILURE = `
local failures = redis.call('INCR', KEYS[2])
if failures == 1 then redis.call('EXPIRE', KEYS[2], 3600) end
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= 5 then return 0 end
count = redis.call('INCR', KEYS[1])
if count == 1 and ARGV[1] == 'unknown' then redis.call('EXPIRE', KEYS[1], 3600) end
if count == 5 then
  redis.call('EXPIRE', KEYS[1], 900)
  return 1
end
return 0
`;

@Injectable()
export class SignInFailures {
  private readonly logger = new Logger(SignInFailures.name);
  constructor(
    @Inject(ValkeyClient) private readonly client: ValkeyClient,
    @Inject(SMS_DRIVER) private readonly sms: SmsDriver,
  ) {}

  async assertAllowed(subject: SignInSubject, ip: string): Promise<void> {
    const [account, address] = await this.client.connection.mget(
      this.key(subject),
      authKey('fail-ip', ip),
    );
    if (Number(account) >= 5) throw authError('AUTH_LOCKED');
    if (Number(address) >= 30) throw authError('AUTH_RATE_LIMITED');
  }

  async recordFailure(subject: SignInSubject, ip: string): Promise<void> {
    const newlyLocked = await this.client.connection.eval(
      RECORD_FAILURE,
      2,
      this.key(subject),
      authKey('fail-ip', ip),
      subject.userId ? 'known' : 'unknown',
    );
    if (newlyLocked === 1 && subject.userId && subject.phone) {
      this.logger.warn({ event: 'security', userId: subject.userId }, 'Sign-in locked');
      try {
        await this.sms.send({
          to: subject.phone,
          text: 'Your Dakly sign-in is locked for 15 minutes after repeated incorrect attempts.',
        });
      } catch {
        // Delivery failure must never roll back the lock or expose vendor payloads.
        this.logger.error(
          { event: 'security', userId: subject.userId },
          'Sign-in lock notification failed',
        );
      }
    }
    await this.assertAllowed(subject, ip);
  }

  async reset(subject: SignInSubject): Promise<void> {
    await this.client.connection.del(this.key(subject));
  }

  private key(subject: SignInSubject): string {
    return subject.userId
      ? authKey('fail-user', subject.userId)
      : authKey('fail-target', subject.target);
  }
}
