import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

import type { recipientSkipReasons, recipientStatuses } from '@dakly/contracts/campaigns';
import type { Database } from '@dakly/db/client';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { type Campaign, recipientsWhere, statusWhere } from './campaigns.repository';

export type CampaignRef = { storeId: string; campaignId: string };
export type SendingCampaign = Pick<Campaign, 'id' | 'content'> & { approvedAt: Date | null };
export type OpenCampaign = SendingCampaign & { status: 'sending' | 'cancelled' };
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
      claimedAt: null;
      smsCredits: number | null;
    };

const openColumns = {
  id: campaigns.id,
  content: campaigns.content,
  approvedAt: campaigns.approvedAt,
  status: sql<OpenCampaign['status']>`${campaigns.status}`,
};

// The sender's reads and writes: the sweeps, the recipient claims and the settlement.
@Injectable()
export class CampaignSendingRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // The sweeps run across stores, so SECURITY DEFINER functions name the campaigns with work.
  async listDue(asOf: Date): Promise<CampaignRef[]> {
    const result = await this.global.execute<CampaignRef>(
      sql`select store_id as "storeId", campaign_id as "campaignId" from due_campaigns(${asOf.toISOString()}::timestamptz)`,
    );
    return result.rows;
  }

  async listSending(): Promise<CampaignRef[]> {
    const result = await this.global.execute<CampaignRef>(
      sql`select store_id as "storeId", campaign_id as "campaignId" from sending_campaigns()`,
    );
    return result.rows;
  }

  // Guarded on the send time too, so a campaign edited and approved again meanwhile waits.
  async start(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({ status: 'sending', startedAt: now, updatedAt: now })
        .where(and(statusWhere(storeId, id, 'scheduled'), lte(campaigns.scheduledFor, now))),
    );
  }

  // A share lock: a pause, cancel or finish waits until this claim commits, and the claim after
  // it sees the new status. A cancelled campaign is locked until it is settled, so its recipients
  // left in sending under an expired claim are resolved.
  async lockSending(storeId: string, id: string): Promise<OpenCampaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select(openColumns).from(campaigns).where(openWhere(storeId, id)).for('share'),
    );
    return row;
  }

  // SKIP LOCKED, so two workers never claim the same recipient.
  async lockNextRecipient(
    storeId: string,
    campaignId: string,
    { claimedBefore, onlyExpired }: { claimedBefore: Date; onlyExpired: boolean },
  ): Promise<ClaimableRecipient | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
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
              onlyExpired ? undefined : eq(campaignRecipients.status, 'queued'),
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
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
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
        ),
    );
  }

  async lockForFinish(storeId: string, id: string): Promise<OpenCampaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select(openColumns).from(campaigns).where(openWhere(storeId, id)).for('update'),
    );
    return row;
  }

  async markSettled(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({ settledAt: now })
        .where(
          and(eq(campaigns.storeId, storeId), eq(campaigns.id, id), isNull(campaigns.settledAt)),
        ),
    );
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

  // At most one refresh an interval: the guarded stamp lets one caller through, which counts.
  async refreshCounts(
    storeId: string,
    id: string,
    { now, countedBefore }: { now: Date; countedBefore: Date | null },
  ): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      const stamped = await tx
        .update(campaigns)
        .set({ countsAt: now })
        .where(
          and(
            eq(campaigns.storeId, storeId),
            eq(campaigns.id, id),
            countedBefore
              ? or(isNull(campaigns.countsAt), lte(campaigns.countsAt, countedBefore))
              : undefined,
          ),
        )
        .returning({ id: campaigns.id });
      if (stamped.length === 0) return;
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
        .set(counts!)
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id)));
    });
  }
}

// Sending, or cancelled after it started and not yet settled.
function openWhere(storeId: string, id: string) {
  return and(
    eq(campaigns.storeId, storeId),
    eq(campaigns.id, id),
    or(
      eq(campaigns.status, 'sending'),
      and(
        eq(campaigns.status, 'cancelled'),
        isNotNull(campaigns.startedAt),
        isNull(campaigns.settledAt),
      ),
    ),
  );
}

function countOf(statuses: RecipientStatus[]) {
  return sql<number>`count(*) filter (where ${inArray(campaignRecipients.status, statuses)})`.mapWith(
    Number,
  );
}
