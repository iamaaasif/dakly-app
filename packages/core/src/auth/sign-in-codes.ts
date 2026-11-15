import { randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { CodePurpose, SignUpInput } from '@dakly/contracts/auth';

import { EmailService } from '../email/email.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { SmsService } from '../sms/sms.service';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import { SignInFailures, type SignInSubject } from './sign-in-failures';

export type PhoneProof = { phone: string; verifiedAt: string; expiresAt: number };
export type PasswordProof = { passwordState: string; expiresAt: number; identifierState?: string };
export type FreshProof = PhoneProof | PasswordProof;
type CodeGrant = {
  userId?: string;
  registration?: SignUpInput;
  email?: string;
  proof?: FreshProof;
};

const SAVE = `
if redis.call('EXISTS', KEYS[3]) == 1 then return -1 end
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[2], '1', 'EX', 30)
redis.call('HSET', KEYS[1], 'hash', ARGV[1], 'data', ARGV[2], 'tries', 0)
redis.call('EXPIRE', KEYS[1], 600)
return 1
`;
const CONSUME = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end
local hash = redis.call('HGET', KEYS[1], 'hash')
if not hash then return nil end
if hash ~= ARGV[1] then
  if redis.call('HINCRBY', KEYS[1], 'tries', 1) >= 5 then redis.call('DEL', KEYS[1]) end
  return nil
end
local remaining = redis.call('PTTL', KEYS[1])
if remaining <= 0 then redis.call('DEL', KEYS[1]); return nil end
local data = redis.call('HGET', KEYS[1], 'data')
redis.call('SET', KEYS[2], '1', 'PX', remaining)
redis.call('DEL', KEYS[1])
return data
`;

@Injectable()
export class SignInCodes {
  constructor(
    @Inject(ValkeyClient) private readonly client: ValkeyClient,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  async send(
    subject: SignInSubject,
    purpose: CodePurpose,
    ip: string,
    registration?: SignUpInput,
    proof?: FreshProof,
  ): Promise<void> {
    await this.failures.assertAllowed(subject, ip);
    if (await this.client.connection.exists(authKey('resend', subject.target)))
      throw authError('AUTH_RATE_LIMITED');
    for (const [key, limit] of [
      [authKey('send-target', subject.target), 5],
      [authKey('send-ip', ip), 20],
    ] as const) {
      if (!(await this.limiter.consume(key, limit, 3600)).allowed)
        throw authError('AUTH_RATE_LIMITED');
    }
    const code = await this.saveCode(subject, purpose, registration, proof);
    try {
      const text = `Your Dakly code is ${code}. It expires in 10 minutes.`;
      if (subject.email)
        await this.email.send({ to: subject.email, subject: 'Your Dakly code', text });
      else await this.sms.send({ to: subject.target, text });
    } catch {
      // Keep the saved challenge and cooldown: delivery may have succeeded before the timeout.
      throw authError(subject.email ? 'AUTH_EMAIL_UNAVAILABLE' : 'AUTH_SMS_UNAVAILABLE');
    }
  }

  async consume(
    subject: SignInSubject,
    purpose: CodePurpose,
    code: string,
    ip: string,
  ): Promise<CodeGrant> {
    await this.failures.assertAllowed(subject, ip);
    const data = await this.client.connection.eval(
      CONSUME,
      2,
      this.key(this.boundTarget(subject), purpose),
      this.marker(this.boundTarget(subject), purpose, code),
      this.hash(this.boundTarget(subject), purpose, code),
    );
    if (data === -1) throw authError('AUTH_CODE_INVALID');
    if (typeof data !== 'string') {
      await this.failures.recordFailure(subject, ip);
      throw authError('AUTH_CODE_INVALID');
    }
    return JSON.parse(data) as CodeGrant;
  }

  private async saveCode(
    subject: SignInSubject,
    purpose: CodePurpose,
    registration?: SignUpInput,
    proof?: FreshProof,
  ): Promise<string> {
    // Do not regenerate a still-recognized consumed code for this target and purpose.
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const saved = await this.client.connection.eval(
        SAVE,
        3,
        this.key(this.boundTarget(subject), purpose),
        authKey('resend', subject.target),
        this.marker(this.boundTarget(subject), purpose, code),
        this.hash(this.boundTarget(subject), purpose, code),
        JSON.stringify({
          userId: subject.userId,
          registration,
          email: subject.email,
          proof,
        } satisfies CodeGrant),
      );
      if (saved === 1) return code;
      if (saved === 0) throw authError('AUTH_RATE_LIMITED');
    }
    throw authError(subject.email ? 'AUTH_EMAIL_UNAVAILABLE' : 'AUTH_SMS_UNAVAILABLE');
  }

  private boundTarget(subject: SignInSubject): string {
    return subject.binding ? JSON.stringify([subject.target, subject.binding]) : subject.target;
  }

  private marker(target: string, purpose: CodePurpose, code: string): string {
    return authKey('consumed', JSON.stringify([target, purpose, code]));
  }

  private key(target: string, purpose: CodePurpose): string {
    return authKey(`code:${purpose}`, target);
  }
  private hash(target: string, purpose: CodePurpose, code: string): string {
    return authKey('code-hash', JSON.stringify([target, purpose, code]));
  }
}
