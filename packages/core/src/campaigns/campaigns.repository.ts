import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';

import type {
  CampaignChannel,
  CampaignGoal,
  CampaignListQuery,
  campaignPauseReasons,
  CampaignStatus,
  recipientSkipReasons,
  SmsCampaignContent,
} from '@dakly/contracts/campaigns';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';

export type Campaign = {
  id: string;
  name: string;
  goal: CampaignGoal | null;
  channel: CampaignChannel;
  content: SmsCampaignContent;
  includeSegmentIds: string[];
  excludeSegmentIds: string[];
  scheduledFor: Date | null;
  status: CampaignStatus;
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
  'name' | 'goal' | 'content' | 'includeSegmentIds' | 'excludeSegmentIds' | 'scheduledFor'
>;

export type FrozenRecipient = {
  contactId: string;
  destinationAddress: string | null;
} & (
  | { status: 'queued'; skipReason: null }
  | { status: 'skipped'; skipReason: (typeof recipientSkipReasons)[number] }
);
export type CampaignApproval = Pick<Campaign, 'status' | 'updatedAt'> & {
  startedAt: Date | null;
  approvedByUserId: string | null;
  approvedAt: Date;
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
  finishedAt?: Date;
  approvedByUserId?: null;
  approvedAt?: null;
  estimatedCostPoisha?: null;
  recipientsCount?: 0;
  skippedCount?: 0;
};

const campaignColumns = {
  id: campaigns.id,
  name: campaigns.name,
  goal: campaigns.goal,
  channel: campaigns.channel,
  content: campaigns.content,
  includeSegmentIds: campaigns.includeSegmentIds,
  excludeSegmentIds: campaigns.excludeSegmentIds,
  scheduledFor: campaigns.scheduledFor,
  status: campaigns.status,
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

  async list(storeId: string, query: CampaignListQuery): Promise<Campaign[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(campaignColumns)
        .from(campaigns)
        .where(
          and(
            eq(campaigns.storeId, storeId),
            query.cursor ? lt(campaigns.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(campaigns.id))
        .limit(query.limit + 1),
    );
    return rows;
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
    draft: CampaignDraft & { channel: 'sms'; createdByUserId: string | null },
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
        .values(recipients.map((recipient) => ({ storeId, campaignId, ...recipient }))),
    );
  }

  async markApproved(
    storeId: string,
    id: string,
    approval: CampaignApproval,
  ): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set(approval)
        .where(statusWhere(storeId, id, 'draft'))
        .returning(campaignColumns),
    );
    return row;
  }

  // Holds a scheduled campaign while it goes back to draft or is cancelled, so the sweep that
  // starts due campaigns (CAMP-3) waits for the change.
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

  async removeDraft(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(campaigns)
        .where(statusWhere(storeId, id, 'draft'))
        .returning({ id: campaigns.id }),
    );
    return rows.length > 0;
  }
}

export function statusWhere(storeId: string, id: string, status: CampaignStatus) {
  return and(eq(campaigns.storeId, storeId), eq(campaigns.id, id), eq(campaigns.status, status));
}

export function recipientsWhere(storeId: string, campaignId: string) {
  return and(
    eq(campaignRecipients.storeId, storeId),
    eq(campaignRecipients.campaignId, campaignId),
  );
}
