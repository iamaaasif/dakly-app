import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

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

  async recordTap(
    storeId: string,
    { campaignId, contactId, at }: { campaignId: string; contactId: string; at: Date },
  ) {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .update(campaignRecipients)
        .set({ tappedAt: at })
        .where(
          and(
            recipientsWhere(storeId, campaignId),
            eq(campaignRecipients.contactId, contactId),
            or(isNull(campaignRecipients.tappedAt), gt(campaignRecipients.tappedAt, at)),
          ),
        )
        .returning({ id: campaignRecipients.id }),
    );
    return row !== undefined;
  }
}

function countOf(statuses: (typeof recipientStatuses)[number][]) {
  return sql<number>`count(*) filter (where ${inArray(campaignRecipients.status, statuses)})`.mapWith(
    Number,
  );
}
