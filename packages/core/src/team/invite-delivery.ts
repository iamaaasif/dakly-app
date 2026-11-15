import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EmailService } from '../email/email.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { SmsService } from '../sms/sms.service';
import { teamError } from './team.errors';

export const INVITE_ORIGIN = Symbol('INVITE_ORIGIN');
type Recipient = { phone?: string; email?: string };

@Injectable()
export class InviteDelivery {
  constructor(
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(INVITE_ORIGIN) private readonly origin: string,
  ) {}

  async reserve(storeId: string, input: Recipient, ip: string): Promise<void> {
    const recipient = JSON.stringify([storeId, input.phone ?? input.email]);
    for (const [kind, value, limit, seconds] of [
      ['cooldown', recipient, 1, 30],
      ['recipient', recipient, 5, 3600],
      ['ip', ip, 20, 3600],
    ] as const) {
      const key = `team-invite:${kind}:${createHash('sha256').update(value).digest('hex')}`;
      if (!(await this.limiter.consume(key, limit, seconds)).allowed)
        throw teamError('INVITE_RATE_LIMITED');
    }
  }
  async send(input: Recipient, token: string): Promise<void> {
    const text = `Join your team on Dakly: ${this.origin}/invites/accept#token=${token}. This link expires in 7 days.`;
    try {
      if (input.email)
        await this.email.send({ to: input.email, subject: 'Your Dakly team invite', text });
      else await this.sms.send({ to: input.phone!, text });
    } catch {
      // A timeout can follow delivery; retain the committed invite and require explicit resend.
      throw teamError('INVITE_DELIVERY_UNAVAILABLE');
    }
  }
}
