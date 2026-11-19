import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { type Campaign, recipientsWhere } from './campaigns.repository';

export type ClaimableRecipient = {
  id: string;
  contactId: string;
  destinationAddress: string | null;
  providerMessageId: string | null;
  claimedAt: Date | null;
  dispatchStartedAt: Date | null;
  optOutLinkCode: string | null;
  status: 'queued' | 'sending';
  sendAttempts: number;
};
type RecipientRow = typeof campaignRecipients.$inferSelect;
type RecipientStatus = RecipientRow['status'];
type RecipientChange = Pick<RecipientRow, 'status'> &
  Partial<
    Omit<
      RecipientRow,
      | 'id'
      | 'storeId'
      | 'campaignId'
      | 'contactId'
      | 'contactIdentityId'
      | 'destinationAddress'
      | 'createdAt'
    >
  >;

const CAMPAIGNS_PER_STORE = 100;

// The sender's reads and writes: the sweeps, the recipient claims and the settlement.
@Injectable()
export class CampaignSendingRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Only the due store IDs cross RLS. The update below runs in the tenant transaction.
  async listDueStores(asOf: Date, after: string | null, limit: number): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(sql`
      select store_id as "storeId" from campaign_send_work_stores(${asOf.toISOString()}::timestamptz,
        ${after}::uuid, ${limit}::integer)
    `);
    return result.rows.map(({ storeId }) => storeId);
  }

  async startDueInStore(storeId: string, now: Date): Promise<void> {
    const eligible = and(
      eq(campaigns.storeId, storeId),
      sql`${campaigns.status} = 'scheduled'`,
      lte(campaigns.scheduledFor, now),
    );
    await this.database.forStore(storeId, async (tx) => {
      // Select the bounded batch once. A lock held by an edit or cancellation skips that row.
      const due = tx
        .$with('due_campaigns_to_start')
        .as(
          tx
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(eligible)
            .orderBy(asc(campaigns.scheduledFor), asc(campaigns.id))
            .limit(CAMPAIGNS_PER_STORE)
            .for('update', { skipLocked: true }),
        );
      await tx
        .with(due)
        .update(campaigns)
        .set({ status: 'sending', startedAt: now, updatedAt: now })
        .where(and(eligible, inArray(campaigns.id, tx.select({ id: due.id }).from(due))));
    });
  }

  // Keep the active lane and the cancellation lane independent of one another.
  async firstWork(storeId: string, expiredBefore: Date) {
    const active = sql`${campaigns.status} = 'sending' and ${campaigns.shortLinkBase} is not null`;
    const cancelled = sql`${campaigns.status} = 'cancelled' and ${campaigns.settlementPendingAt} is not null
      and not exists (
        select 1 from campaign_recipients r
        where r.store_id = ${storeId} and r.campaign_id = ${campaigns.id} and r.status = 'sending'
        having bool_and(coalesce(r.claimed_at >= ${expiredBefore.toISOString()}::timestamptz, true))
      )`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinctOn([campaigns.status], {
          campaignId: campaigns.id,
          status: campaigns.status,
        })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), or(active, cancelled)))
        .orderBy(asc(campaigns.status), asc(campaigns.startedAt), asc(campaigns.id)),
    );
  }

  async lockNextRecipient(
    storeId: string,
    campaign: Pick<Campaign, 'id' | 'status'>,
    claimedBefore: Date,
  ): Promise<ClaimableRecipient | undefined> {
    const expired = and(
      eq(campaignRecipients.status, 'sending'),
      lt(campaignRecipients.claimedAt, claimedBefore),
    );
    const eligible =
      campaign.status === 'sending'
        ? or(expired, eq(campaignRecipients.status, 'queued'))
        : expired;
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select({
          id: campaignRecipients.id,
          contactId: campaignRecipients.contactId,
          destinationAddress: campaignRecipients.destinationAddress,
          providerMessageId: campaignRecipients.providerMessageId,
          claimedAt: campaignRecipients.claimedAt,
          dispatchStartedAt: campaignRecipients.dispatchStartedAt,
          optOutLinkCode: campaignRecipients.optOutLinkCode,
          status: sql<ClaimableRecipient['status']>`${campaignRecipients.status}`,
          sendAttempts: campaignRecipients.sendAttempts,
        })
        .from(campaignRecipients)
        .where(and(recipientsWhere(storeId, campaign.id), eligible))
        .orderBy(asc(campaignRecipients.id))
        .limit(1)
        .for('update', { skipLocked: true }),
    );
    return row;
  }

  // Guarded on the status, and on the claim when one is given, so a stale worker cannot overwrite
  // a newer claim.
  async changeRecipient(
    storeId: string,
    id: string,
    from: { status: RecipientStatus; claimedAt?: Date; uncertainReceipt?: string },
    change: RecipientChange,
  ): Promise<boolean> {
    const { status, claimedAt, uncertainReceipt } = from;
    const { status: currentStatus, errorCode, providerMessageId } = campaignRecipients;
    const sameStatus = eq(currentStatus, status);
    const unknown = and(eq(currentStatus, 'failed'), eq(errorCode, 'outcome_unknown'));
    const guardedStatus = uncertainReceipt
      ? and(
          or(sameStatus, unknown),
          or(isNull(providerMessageId), eq(providerMessageId, uncertainReceipt)),
        )
      : sameStatus;
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaignRecipients)
        .set(change)
        .where(
          and(
            eq(campaignRecipients.storeId, storeId),
            eq(campaignRecipients.id, id),
            guardedStatus,
            claimedAt ? eq(campaignRecipients.claimedAt, claimedAt) : undefined,
          ),
        )
        .returning({ id: campaignRecipients.id }),
    );
    return row !== undefined;
  }
}
