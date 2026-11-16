import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';

import type {
  CampaignChannel,
  CampaignGoal,
  CampaignListQuery,
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
  approvedByUserId: string | null;
  approvedAt: Date;
  estimatedCostPoisha: number;
  recipientsCount: number;
  skippedCount: number;
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
      tx.update(campaigns).set(change).where(draftWhere(storeId, id)).returning(campaignColumns),
    );
    return row;
  }

  // Holds the draft until the approval commits, so two approvals cannot both freeze it.
  async lockDraft(storeId: string, id: string): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select(campaignColumns).from(campaigns).where(draftWhere(storeId, id)).for('update'),
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
      tx.update(campaigns).set(approval).where(draftWhere(storeId, id)).returning(campaignColumns),
    );
    return row;
  }

  async removeDraft(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx.delete(campaigns).where(draftWhere(storeId, id)).returning({ id: campaigns.id }),
    );
    return rows.length > 0;
  }
}

function draftWhere(storeId: string, id: string) {
  return and(eq(campaigns.storeId, storeId), eq(campaigns.id, id), eq(campaigns.status, 'draft'));
}
