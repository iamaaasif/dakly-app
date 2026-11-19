import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';

import type { recipientSkipReasons, recipientStatuses } from '@dakly/contracts/campaigns';
import type { Database } from '@dakly/db/client';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { type Campaign, recipientsWhere, statusWhere } from './campaigns.repository';

export type SendingCampaign = Pick<Campaign, 'id' | 'content'> & {
  approvedAt: Date | null;
  shortLinkBase: string | null;
};
export type ClaimableRecipient = {
  id: string;
  contactId: string;
  destinationAddress: string | null;
  status: 'queued' | 'sending';
  sendAttempts: number;
};
type RecipientStatus = (typeof recipientStatuses)[number];
export type RecipientChange =
  | { status: 'skipped'; skipReason: (typeof recipientSkipReasons)[number] }
  | { status: 'sending'; claimedAt: Date; sendAttempts: number }
  | { status: 'queued'; claimedAt: null }
  | {
      status: 'sent';
      providerMessageId: string;
      smsCredits: number;
      sentAt: Date;
      claimedAt: null;
    }
  // Credits are kept for a message the provider may have taken, null for one it did not.
  | {
      status: 'failed';
      errorCode: string;
      failedAt: Date;
      claimedAt?: null;
      smsCredits: number | null;
    };

const CAMPAIGNS_PER_STORE = 100;

const sendingColumns = {
  id: campaigns.id,
  content: campaigns.content,
  approvedAt: campaigns.approvedAt,
  shortLinkBase: campaigns.shortLinkBase,
};

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
      select store_id as "storeId" from campaign_due_stores(${asOf.toISOString()}::timestamptz,
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

  async listSendingStores(after: string | null, limit: number): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(
      sql`select store_id as "storeId" from campaign_sending_stores(${after}::uuid, ${limit}::integer)`,
    );
    return result.rows.map(({ storeId }) => storeId);
  }

  async firstSending(storeId: string): Promise<string | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), sql`${campaigns.status} = 'sending'`))
        .orderBy(asc(campaigns.startedAt), asc(campaigns.id))
        .limit(1),
    );
    return row?.id;
  }

  // A share lock: a pause, cancel or finish waits until this claim commits, and the claim after
  // it sees the new status.
  async lockSending(storeId: string, id: string): Promise<SendingCampaign | undefined> {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select(sendingColumns)
        .from(campaigns)
        .where(statusWhere(storeId, id, 'sending'))
        .for('share'),
    );
    return row;
  }

  // SKIP LOCKED, so two workers never claim the same recipient.
  async lockNextRecipient(
    storeId: string,
    campaignId: string,
    claimedBefore: Date,
  ): Promise<ClaimableRecipient | undefined> {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select({
          id: campaignRecipients.id,
          contactId: campaignRecipients.contactId,
          destinationAddress: campaignRecipients.destinationAddress,
          status: sql<ClaimableRecipient['status']>`${campaignRecipients.status}`,
          sendAttempts: campaignRecipients.sendAttempts,
        })
        .from(campaignRecipients)
        .where(
          and(
            recipientsWhere(storeId, campaignId),
            inArray(campaignRecipients.status, ['queued', 'sending']),
            or(
              eq(campaignRecipients.status, 'queued'),
              lt(campaignRecipients.claimedAt, claimedBefore),
            ),
          ),
        )
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
    from: { status: RecipientStatus; claimedAt?: Date },
    change: RecipientChange,
  ): Promise<boolean> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaignRecipients)
        .set(change)
        .where(
          and(
            eq(campaignRecipients.storeId, storeId),
            eq(campaignRecipients.id, id),
            eq(campaignRecipients.status, from.status),
            from.claimedAt ? eq(campaignRecipients.claimedAt, from.claimedAt) : undefined,
          ),
        )
        .returning({ id: campaignRecipients.id }),
    );
    return row !== undefined;
  }

  async lockForFinish(storeId: string, id: string): Promise<SendingCampaign | undefined> {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select(sendingColumns)
        .from(campaigns)
        .where(statusWhere(storeId, id, 'sending'))
        .for('update'),
    );
    return row;
  }

  // Recipients not yet settled, and the credits to charge.
  async settlement(
    storeId: string,
    campaignId: string,
  ): Promise<{ unsettled: number; chargedCredits: number }> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          unsettled:
            sql<number>`count(*) filter (where ${campaignRecipients.status} in ('queued', 'sending'))`.mapWith(
              Number,
            ),
          // Credits are set only on a message the provider took or may have taken.
          chargedCredits: sql<number>`coalesce(sum(${campaignRecipients.smsCredits}), 0)`.mapWith(
            Number,
          ),
        })
        .from(campaignRecipients)
        .where(recipientsWhere(storeId, campaignId)),
    );
    return row!;
  }
}
