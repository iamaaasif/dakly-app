import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { recipientsWhere } from './campaigns.repository';

const pending = and(
  sql`${campaigns.status} = 'cancelled'`,
  isNotNull(campaigns.settlementPendingAt),
);

export type CancellationReceiptClaim = {
  id: string;
  providerMessageId: string;
  claimedAt: Date;
};

@Injectable()
export class CampaignCancellationsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  async listStores(after: string | null, limit: number): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(sql`
      select store_id as "storeId" from campaign_cancelled_stores(${after}::uuid, ${limit}::integer)
    `);
    return result.rows.map(({ storeId }) => storeId);
  }

  async firstPending(storeId: string): Promise<string | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), pending))
        .orderBy(asc(campaigns.settlementPendingAt), asc(campaigns.id))
        .limit(1),
    );
    return row?.id;
  }

  async lockPending(storeId: string, id: string) {
    const [row] = await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .select({
          approvedAt: campaigns.approvedAt,
          content: campaigns.content,
          shortLinkBase: campaigns.shortLinkBase,
        })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id), pending))
        .for('update'),
    );
    return row;
  }

  async expireUnknown(
    storeId: string,
    campaignId: string,
    { before, now, smsCredits }: { before: Date; now: Date; smsCredits: number },
  ) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .update(campaignRecipients)
        .set({ status: 'failed', errorCode: 'outcome_unknown', failedAt: now, smsCredits })
        .where(
          and(expired(storeId, campaignId, before), isNull(campaignRecipients.providerMessageId)),
        ),
    );
  }

  async claimReceipt(
    storeId: string,
    campaignId: string,
    before: Date,
    claimedAt: Date,
  ): Promise<CancellationReceiptClaim | undefined> {
    return this.tenant.inTransaction(storeId, async (tx) => {
      const [row] = await tx
        .select({
          id: campaignRecipients.id,
          providerMessageId: campaignRecipients.providerMessageId,
        })
        .from(campaignRecipients)
        .where(
          and(
            expired(storeId, campaignId, before),
            isNotNull(campaignRecipients.providerMessageId),
          ),
        )
        .orderBy(asc(campaignRecipients.id))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row?.providerMessageId) return;
      await tx
        .update(campaignRecipients)
        .set({ claimedAt })
        .where(and(recipientsWhere(storeId, campaignId), eq(campaignRecipients.id, row.id)));
      return { id: row.id, providerMessageId: row.providerMessageId, claimedAt };
    });
  }

  async recordReceipt(
    storeId: string,
    campaignId: string,
    claim: CancellationReceiptClaim,
    change: Pick<
      typeof campaignRecipients.$inferInsert,
      'status' | 'errorCode' | 'claimedAt' | 'sentAt' | 'failedAt' | 'smsCredits'
    >,
  ) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .update(campaignRecipients)
        .set(change)
        .where(
          and(
            recipientsWhere(storeId, campaignId),
            eq(campaignRecipients.id, claim.id),
            eq(campaignRecipients.status, 'sending'),
            eq(campaignRecipients.providerMessageId, claim.providerMessageId),
            eq(campaignRecipients.claimedAt, claim.claimedAt),
          ),
        ),
    );
  }
}

function expired(storeId: string, campaignId: string, before: Date) {
  return and(
    recipientsWhere(storeId, campaignId),
    eq(campaignRecipients.status, 'sending'),
    lt(campaignRecipients.claimedAt, before),
  );
}
