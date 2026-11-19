import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';

import { AuditService } from '../audit/audit.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { StoreTransaction } from '../platform/database/store-transaction';
import { contactError } from './contacts.errors';

const WINDOW_SECONDS = 3600;
const HOURLY_LIMITS = { lookup: 30, write: 10 } as const;

@Injectable()
export class ContactPhoneAccessService {
  constructor(
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async checkLimit(
    storeId: string,
    operation: keyof typeof HOURLY_LIMITS,
    seeFullPhone: boolean,
    actor: AuditEntry['actor'],
  ): Promise<void> {
    if (seeFullPhone || actor.kind !== 'user') return;
    const key = `contacts:phone-${operation}:${storeId}:${actor.userId}`;
    const { allowed } = await this.limiter.consume(key, HOURLY_LIMITS[operation], WINDOW_SECONDS);
    if (allowed) return;

    await this.transaction.run(storeId, () =>
      this.audit.record(storeId, {
        actor,
        action: `contact.phone_${operation}_rate_limited`,
        entityType: 'store',
        entityId: storeId,
      }),
    );
    throw contactError('CONTACT_PHONE_RATE_LIMITED');
  }
}
