import { Inject, Injectable, Logger } from '@nestjs/common';

import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { hashToken } from '../platform/crypto/token-hash';
import { staffError } from './admin.errors';
import { StaffRepository } from './staff.repository';

@Injectable()
export class StaffAttempts {
  private readonly logger = new Logger(StaffAttempts.name);
  constructor(
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(StaffRepository) private readonly repository: StaffRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async ip(ip: string): Promise<void> {
    const result = await this.limiter.consume(
      `staff:ip:${hashToken(ip).toString('hex')}`,
      30,
      3600,
    );
    if (!result.allowed) throw staffError('STAFF_RATE_LIMITED');
  }

  assertAllowed(staff: { blockedUntil: Date | null }): void {
    if (staff.blockedUntil && staff.blockedUntil > this.clock.now())
      throw staffError('STAFF_RATE_LIMITED');
  }

  async failed(staff: {
    id: string;
    failedAttempts: number;
    blockedUntil: Date | null;
  }): Promise<void> {
    const attempts =
      staff.blockedUntil && staff.blockedUntil <= this.clock.now() ? 1 : staff.failedAttempts + 1;
    if (attempts >= 5)
      this.logger.warn(
        { event: 'security', staffUserId: staff.id },
        'Staff authentication temporarily blocked',
      );
    await this.repository.update(staff.id, {
      failedAttempts: attempts,
      blockedUntil: attempts >= 5 ? new Date(this.clock.now().getTime() + 900000) : null,
    });
  }
}
