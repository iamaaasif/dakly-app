import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';

import type {
  CampaignApprovalFailureCode,
  CampaignChannel,
  CampaignGoal,
  CampaignListQuery,
  campaignPauseReasons,
  CampaignStatus,
  recipientSkipReasons,
  CampaignContent,
} from '@dakly/contracts/campaigns';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { escapeLike } from '../platform/database/escape-like';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Campaign = {
  id: string;
  name: string;
  goal: CampaignGoal | null;
  channel: CampaignChannel;
  content: CampaignContent;
  channelConnectionId: string | null;
  includeSegmentIds: string[];
  excludeSegmentIds: string[];
  scheduledFor: Date | null;
  status: CampaignStatus;
  approvalCheckedCount: number;
  approvalEstimatedTotal: number;
  approvalFailureCode: CampaignApprovalFailureCode | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  recipientsCount: number;
  skippedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  tappedCount: number;
  failedCount: number;
  countsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type CampaignDraft = Pick<
  Campaign,
  | 'name'
  | 'goal'
  | 'content'
  | 'channelConnectionId'
  | 'includeSegmentIds'
  | 'excludeSegmentIds'
  | 'scheduledFor'
>;

export type FrozenRecipient = {
  contactId: string;
  // Messenger only: the contact's identity on the campaign's Page.
  contactIdentityId?: string | null;
  destinationAddress: string | null;
} & (
  | { status: 'queued'; skipReason: null }
  | { status: 'skipped'; skipReason: (typeof recipientSkipReasons)[number] }
);
export type CampaignApproval = Pick<Campaign, 'status' | 'updatedAt'> & {
  // SMS only: Messenger has no short links.
  shortLinkBase: string | null;
  startedAt: Date | null;
  estimatedCostPoisha: number;
  recipientsCount: number;
  skippedCount: number;
};

type CampaignPauseReason = (typeof campaignPauseReasons)[number];

// The state a change starts from; resume also needs the pause to be a manual one.
export type CampaignStatusGuard = { status: CampaignStatus; pauseReason?: CampaignPauseReason };

// A state change; returning to draft also clears the approval.
export type CampaignStatusChange = Pick<Campaign, 'status' | 'updatedAt'> & {
  pauseReason?: CampaignPauseReason | null;
  balancePauseRevision?: number | null;
  finishedAt?: Date;
  startedAt?: Date;
  settlementPendingAt?: Date | null;
  countsAt?: null;
  approvedByUserId?: null;
  approvedAt?: null;
  shortLinkBase?: string | null;
  estimatedCostPoisha?: null;
  recipientsCount?: 0;
  skippedCount?: 0;
};

export const campaignColumns = {
  id: campaigns.id,
  name: campaigns.name,
  goal: campaigns.goal,
  channel: campaigns.channel,
  content: campaigns.content,
  channelConnectionId: campaigns.channelConnectionId,
  includeSegmentIds: campaigns.includeSegmentIds,
  excludeSegmentIds: campaigns.excludeSegmentIds,
  scheduledFor: campaigns.scheduledFor,
  status: campaigns.status,
  approvalCheckedCount: campaigns.approvalCheckedCount,
  approvalEstimatedTotal: campaigns.approvalEstimatedTotal,
  approvalFailureCode: campaigns.approvalFailureCode,
  startedAt: campaigns.startedAt,
  finishedAt: campaigns.finishedAt,
  recipientsCount: campaigns.recipientsCount,
  skippedCount: campaigns.skippedCount,
  sentCount: campaigns.sentCount,
  deliveredCount: campaigns.deliveredCount,
  readCount: campaigns.readCount,
  tappedCount: campaigns.tappedCount,
  failedCount: campaigns.failedCount,
  countsAt: campaigns.countsAt,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
};

@Injectable()
export class CampaignsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async list(
    storeId: string,
    query: CampaignListQuery & { timeZone?: string | null },
  ): Promise<Campaign[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(campaignColumns)
        .from(campaigns)
        .where(
          and(
            eq(campaigns.storeId, storeId),
            query.cursor
              ? sql`(${campaigns.createdAt}, ${campaigns.id}) <
              (select created_at, id from campaigns where store_id = ${storeId} and id = ${query.cursor})`
              : undefined,
            query.search ? ilike(campaigns.name, `%${escapeLike(query.search)}%`) : undefined,
            query.status ? eq(campaigns.status, query.status) : undefined,
            query.channel ? eq(campaigns.channel, query.channel) : undefined,
            query.createdFrom
              ? sql`${campaigns.createdAt} >= ${query.createdFrom}::date::timestamp at time zone ${query.timeZone}`
              : undefined,
            query.createdThrough
              ? sql`${campaigns.createdAt} < (${query.createdThrough}::date + 1)::timestamp at time zone ${query.timeZone}`
              : undefined,
          ),
        )
        .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
        .limit(query.limit + 1),
    );
    return rows;
  }

  attributionSources(storeId: string, buyer: { id: string; phone: string }, ids: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: campaigns.id,
          sourceId: campaigns.id,
          channel: campaigns.channel,
          sentAt: campaignRecipients.sentAt,
        })
        .from(campaignRecipients)
        .innerJoin(
          campaigns,
          and(eq(campaigns.storeId, storeId), eq(campaigns.id, campaignRecipients.campaignId)),
        )
        .where(
          and(
            eq(campaignRecipients.storeId, storeId),
            eq(campaignRecipients.contactId, buyer.id),
            inArray(campaignRecipients.campaignId, ids),
            inArray(campaignRecipients.status, ['sent', 'delivered', 'read']),
            or(
              ne(campaigns.channel, 'sms'),
              eq(campaignRecipients.destinationAddress, buyer.phone),
            ),
          ),
        ),
    );
  }

  async find(storeId: string, id: string): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(campaignColumns)
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id)))
        .limit(1),
    );
    return row;
  }

  async findPauseReason(storeId: string, id: string): Promise<CampaignPauseReason | null> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ pauseReason: campaigns.pauseReason })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id)))
        .limit(1),
    );
    return row?.pauseReason ?? null;
  }

  async insert(
    storeId: string,
    draft: CampaignDraft & { channel: CampaignChannel; createdByUserId: string | null },
  ): Promise<Campaign> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(campaigns)
        .values({ storeId, ...draft })
        .returning(campaignColumns),
    );
    return row!;
  }

  // Guarded on the draft status, so a campaign approved meanwhile is not changed.
  async changeDraft(
    storeId: string,
    id: string,
    change: Partial<CampaignDraft> & Pick<Campaign, 'updatedAt'>,
  ): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set(change)
        .where(statusWhere(storeId, id, 'draft'))
        .returning(campaignColumns),
    );
    return row;
  }

  // Holds the draft until the approval commits, so two approvals cannot both freeze it.
  async lockDraft(storeId: string, id: string): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(campaignColumns)
        .from(campaigns)
        .where(statusWhere(storeId, id, 'draft'))
        .for('update'),
    );
    return row;
  }

  async insertRecipients(
    storeId: string,
    campaignId: string,
    recipients: FrozenRecipient[],
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(campaignRecipients)
        .values(recipients.map((recipient) => ({ storeId, campaignId, ...recipient })))
        // The approval job repeats a page after a crash; the first row for a contact stands.
        .onConflictDoNothing({
          target: [campaignRecipients.campaignId, campaignRecipients.contactId],
        }),
    );
  }

  // The approval job calls this once the audience is frozen and the credits are reserved.
  async markApproved(
    storeId: string,
    id: string,
    approval: CampaignApproval,
  ): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set(approval)
        .where(statusWhere(storeId, id, 'approving'))
        .returning(campaignColumns),
    );
    return row;
  }

  // Holds a scheduled campaign while it goes back to draft, so the due sweep skips it.
  async lockScheduled(
    storeId: string,
    id: string,
  ): Promise<(Campaign & { approvedAt: Date | null }) | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...campaignColumns, approvedAt: campaigns.approvedAt })
        .from(campaigns)
        .where(statusWhere(storeId, id, 'scheduled'))
        .for('update'),
    );
    return row;
  }

  async lockCampaign(storeId: string, id: string, mode: 'share' | 'update') {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select({
          ...campaignColumns,
          approvedAt: campaigns.approvedAt,
          shortLinkBase: campaigns.shortLinkBase,
          settlementPendingAt: campaigns.settlementPendingAt,
          balancePauseRevision: campaigns.balancePauseRevision,
          pauseReason: campaigns.pauseReason,
        })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, id)))
        .for(mode),
    );
    return row;
  }

  async listBalancePaused(storeId: string, topUpRevision: number, after: string | null) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.storeId, storeId),
            sql`${campaigns.status} = 'paused' and ${campaigns.pauseReason} = 'balance'`,
            lt(campaigns.balancePauseRevision, topUpRevision),
            after ? gt(campaigns.id, after) : undefined,
          ),
        )
        .orderBy(asc(campaigns.id))
        .limit(100),
    );
    return rows.map(({ id }) => id);
  }

  // Guarded on the state the change starts from, so a campaign moved meanwhile is left alone.
  async changeStatus(
    storeId: string,
    id: string,
    from: CampaignStatusGuard,
    change: CampaignStatusChange,
  ): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set(change)
        .where(
          and(
            statusWhere(storeId, id, from.status),
            from.pauseReason ? eq(campaigns.pauseReason, from.pauseReason) : undefined,
          ),
        )
        .returning(campaignColumns),
    );
    return row;
  }

  async removeRecipients(storeId: string, campaignId: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.delete(campaignRecipients).where(recipientsWhere(storeId, campaignId)),
    );
  }

  async cancelQueuedRecipients(storeId: string, campaignId: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaignRecipients)
        .set({ status: 'cancelled' })
        .where(and(recipientsWhere(storeId, campaignId), eq(campaignRecipients.status, 'queued'))),
    );
  }

  async settlementTotals(storeId: string, campaignId: string) {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select({
          unsettled:
            sql<number>`count(*) filter (where ${campaignRecipients.status} in ('queued', 'sending'))`.mapWith(
              Number,
            ),
          chargedCredits: sql<number>`coalesce(sum(${campaignRecipients.smsCredits}), 0)`.mapWith(
            Number,
          ),
        })
        .from(campaignRecipients)
        .where(recipientsWhere(storeId, campaignId)),
    );
    return row!;
  }

  async markSettled(storeId: string, campaignId: string, settledAt: Date) {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({ settledAt, settlementPendingAt: null, updatedAt: sql`${campaigns.updatedAt}` })
        .where(and(statusWhere(storeId, campaignId, 'cancelled'), isNull(campaigns.settledAt)))
        .returning({ id: campaigns.id }),
    );
    return row !== undefined;
  }

  async removeDraft(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(campaigns)
        .where(statusWhere(storeId, id, 'draft'))
        .returning({ id: campaigns.id }),
    );
    return rows.length > 0;
  }

  // Recipients are kept 372 days after their campaign finishes (the attribution rebuild horizon).
  async purgeExpiredRecipientsBatch(storeId: string, limit: number): Promise<boolean> {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ count: number }>(sql`
        with removed as (
          delete from campaign_recipients where ctid = any(array(
            select r.ctid from campaign_recipients r
            join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
            where r.store_id = ${storeId} and c.finished_at < now() - interval '372 days'
            limit ${limit} for update of r skip locked))
          returning 1)
        select count(*)::int as count from removed`),
    );
    return rows[0]?.count === limit;
  }
}

export type LockedCampaign = NonNullable<Awaited<ReturnType<CampaignsRepository['lockCampaign']>>>;

export function statusWhere(storeId: string, id: string, status: CampaignStatus) {
  return and(eq(campaigns.storeId, storeId), eq(campaigns.id, id), eq(campaigns.status, status));
}

export function recipientsWhere(storeId: string, campaignId: string) {
  return and(
    eq(campaignRecipients.storeId, storeId),
    eq(campaignRecipients.campaignId, campaignId),
  );
}
