import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { postTargets } from '@dakly/db/schema/social';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class SocialRescheduleRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  moveScheduledTargets(storeId: string, ids: string[], scheduledFor: Date, now: Date) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(postTargets)
        .set({ scheduledFor, updatedAt: now })
        .where(
          and(
            eq(postTargets.storeId, storeId),
            inArray(postTargets.id, ids),
            eq(postTargets.status, 'scheduled'),
          ),
        )
        .returning({ id: postTargets.id }),
    );
  }
}
