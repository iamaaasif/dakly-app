import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { CampaignApprovalFailureCode } from '@dakly/contracts/campaigns';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';
import {
  type Campaign,
  campaignColumns,
  recipientsWhere,
  statusWhere,
} from './campaigns.repository';

// The approval time identifies one approval, so a job left from an earlier one finds nothing.
export type ApprovalKey = { id: string; approvedAt: Date };

// Where an approval job continues: the include segment, and the last contact checked in it.
export type ApprovalCursor = { segmentIndex: number; contactId: string | null };

export type ApprovalProgress = ApprovalCursor & { checkedCount: number };

export type ApprovalStart = Pick<Campaign, 'updatedAt' | 'approvalEstimatedTotal'> & {
  approvedByUserId: string | null;
  approvedAt: Date;
};

@Injectable()
export class CampaignApprovalRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Guarded on the draft status, so two approvals cannot both start.
  async markApproving(
    storeId: string,
    id: string,
    start: ApprovalStart,
  ): Promise<Campaign | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({
          ...start,
          status: 'approving',
          approvalSegmentIndex: 0,
          approvalCursor: null,
          approvalCheckedCount: 0,
          approvalProgressAt: start.updatedAt,
          approvalFailureCode: null,
        })
        .where(statusWhere(storeId, id, 'draft'))
        .returning(campaignColumns),
    );
    return row;
  }

  async findApproval(storeId: string, approval: ApprovalKey) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...campaignColumns,
          segmentIndex: campaigns.approvalSegmentIndex,
          contactId: campaigns.approvalCursor,
        })
        .from(campaigns)
        .where(approvingWhere(storeId, approval)),
    );
    return row;
  }

  // Moves the cursor only while this approval is still the one running.
  async saveApprovalProgress(
    storeId: string,
    approval: ApprovalKey,
    progress: ApprovalProgress,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({
          approvalSegmentIndex: progress.segmentIndex,
          approvalCursor: progress.contactId,
          approvalCheckedCount: progress.checkedCount,
          approvalProgressAt: now,
        })
        .where(approvingWhere(storeId, approval))
        .returning({ id: campaigns.id }),
    );
    return rows.length > 0;
  }

  async countFrozenRecipients(storeId: string, campaignId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          queued:
            sql<number>`count(*) filter (where ${campaignRecipients.status} = 'queued')`.mapWith(
              Number,
            ),
          skipped:
            sql<number>`count(*) filter (where ${campaignRecipients.status} = 'skipped')`.mapWith(
              Number,
            ),
        })
        .from(campaignRecipients)
        .where(recipientsWhere(storeId, campaignId)),
    );
    return row!;
  }

  // Returns how many rows went, so a caller can repeat until none are left.
  async removeRecipientsBatch(storeId: string, campaignId: string, limit: number) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(campaignRecipients)
        .where(
          inArray(
            campaignRecipients.id,
            tx
              .select({ id: campaignRecipients.id })
              .from(campaignRecipients)
              .where(recipientsWhere(storeId, campaignId))
              .limit(limit),
          ),
        )
        .returning({ id: campaignRecipients.id }),
    );
    return rows.length;
  }

  // Back to draft with the reason. The caller has removed the recipients first.
  async failApproval(
    storeId: string,
    approval: ApprovalKey,
    code: CampaignApprovalFailureCode,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({
          status: 'draft',
          approvedByUserId: null,
          approvedAt: null,
          approvalSegmentIndex: 0,
          approvalCursor: null,
          approvalCheckedCount: 0,
          approvalEstimatedTotal: 0,
          approvalProgressAt: null,
          approvalFailureCode: code,
          updatedAt: now,
        })
        .where(approvingWhere(storeId, approval))
        .returning({ id: campaigns.id }),
    );
    return rows.length > 0;
  }
}

function approvingWhere(storeId: string, { id, approvedAt }: ApprovalKey) {
  return and(statusWhere(storeId, id, 'approving'), eq(campaigns.approvedAt, approvedAt));
}
