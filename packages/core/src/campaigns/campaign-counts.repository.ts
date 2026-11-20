import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import type { recipientStatuses } from '@dakly/contracts/campaigns';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';
import { recipientsWhere } from './campaigns.repository';

@Injectable()
export class CampaignCountsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async currentTime(storeId: string): Promise<number> {
    const result = await this.database.inTransaction(storeId, (tx) =>
      tx.execute<{ milliseconds: number }>(sql`
        select floor(extract(epoch from clock_timestamp()) * 1000)::double precision as milliseconds
      `),
    );
    return result.rows[0]!.milliseconds;
  }

  async save(storeId: string, id: string, countedAt: Date): Promise<void> {
    await this.database.inTransaction(storeId, async (tx) => {
      const [counts] = await tx
        .select({
          skippedCount: countOf(['skipped']),
          sentCount: countOf(['sent', 'delivered', 'read']),
          deliveredCount: countOf(['delivered', 'read']),
          readCount: countOf(['read']),
          failedCount: countOf(['failed']),
          tappedCount: sql<number>`count(${campaignRecipients.tappedAt})`.mapWith(Number),
        })
        .from(campaignRecipients)
        .where(recipientsWhere(storeId, id));
      await tx
        .update(campaigns)
        .set({ ...counts, countsAt: countedAt, updatedAt: sql`${campaigns.updatedAt}` })
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id)));
    });
  }

  async markPending(storeId: string, id: string): Promise<void> {
    await this.database.inTransaction(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({ countsAt: null, updatedAt: sql`${campaigns.updatedAt}` })
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id))),
    );
  }

  async recordTap(
    storeId: string,
    { campaignId, contactId, at }: { campaignId: string; contactId: string; at: Date },
  ): Promise<void> {
    await this.database.inTransaction(storeId, async (tx) => {
      const recipient = and(
        recipientsWhere(storeId, campaignId),
        eq(campaignRecipients.contactId, contactId),
      );
      const [firstTap] = await tx
        .update(campaignRecipients)
        .set({ tappedAt: at })
        .where(and(recipient, isNull(campaignRecipients.tappedAt)))
        .returning({ id: campaignRecipients.id });
      if (firstTap) {
        await tx
          .update(campaigns)
          .set({
            tappedCount: sql`${campaigns.tappedCount} + 1`,
            updatedAt: sql`${campaigns.updatedAt}`,
          })
          .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, campaignId)));
      } else {
        await tx
          .update(campaignRecipients)
          .set({ tappedAt: at })
          .where(and(recipient, gt(campaignRecipients.tappedAt, at)));
      }
    });
  }
}

function countOf(statuses: (typeof recipientStatuses)[number][]) {
  return sql<number>`count(*) filter (where ${inArray(campaignRecipients.status, statuses)})`.mapWith(
    Number,
  );
}
