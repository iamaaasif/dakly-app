import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { platformSettings, staffAuditLog } from '@dakly/db/schema/admin';

import { DATABASE } from '../platform/database/database.tokens';
import { StaffDatabase } from '../platform/database/staff-database';

export const AI_RATE_KEY = 'ai_usd_poisha_rate';

@Injectable()
export class AiRateRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(StaffDatabase) private readonly staff: StaffDatabase,
  ) {}

  async read() {
    const [row] = await this.database
      .select({ value: platformSettings.value, updatedAt: platformSettings.updatedAt })
      .from(platformSettings)
      .where(eq(platformSettings.key, AI_RATE_KEY));
    return row;
  }

  // The audit row goes in first (D28), in the same transaction as the change.
  change(input: {
    id: string;
    staffUserId: string;
    poishaPerUsd: number;
    reason: string;
    ip: string;
  }) {
    return this.staff.forStaff(input.staffUserId, async (tx) => {
      await tx.insert(staffAuditLog).values({
        id: input.id,
        staffUserId: input.staffUserId,
        action: 'ai_rate.changed',
        targetType: 'platform_setting',
        targetId: input.id,
        reason: input.reason,
        actionDetails: { poishaPerUsd: input.poishaPerUsd },
        ip: input.ip,
      });
      await tx
        .insert(platformSettings)
        .values({
          key: AI_RATE_KEY,
          value: { poishaPerUsd: input.poishaPerUsd },
          updatedByStaffId: input.staffUserId,
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: {
            value: { poishaPerUsd: input.poishaPerUsd },
            updatedByStaffId: input.staffUserId,
            updatedAt: new Date(),
          },
        });
    });
  }
}
