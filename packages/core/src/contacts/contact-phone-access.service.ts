import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import { bdMobileSchema } from '@dakly/contracts/phone';

import { AuditService } from '../audit/audit.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { StoreTransaction } from '../platform/database/store-transaction';
import { contactError } from './contacts.errors';
import type { ContactFilter } from './contacts.repository';

const WINDOW_SECONDS = 3600;
const HOURLY_LIMITS = { lookup: 30, write: 10 } as const;

@Injectable()
export class ContactPhoneAccess {
  constructor(
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async searchFilter(
    storeId: string,
    search: string | undefined,
    seeFullPhone: boolean,
    actor: AuditEntry['actor'],
  ): Promise<Pick<ContactFilter, 'name' | 'phone' | 'phonePrefix'> | null> {
    if (!search) return {};
    const fullPhone = bdMobileSchema.safeParse(search);
    if (fullPhone.success) {
      await this.checkLimit(storeId, 'lookup', seeFullPhone, actor);
      return { phone: fullPhone.data };
    }
    if (/^\d+$/.test(search)) return seeFullPhone ? { phonePrefix: search } : null;
    // The trigram name index cannot narrow a search shorter than one trigram.
    if (search.length < 3) throw contactError('CONTACT_SEARCH_TOO_SHORT');
    return { name: search };
  }

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
