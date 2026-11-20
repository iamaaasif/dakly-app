import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { CampaignApprovalFailureCode } from '@dakly/contracts/campaigns';
import type { Database } from '@dakly/db/client';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
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
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

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
          approvedByUserId: campaigns.approvedByUserId,
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

  // Records that the approval is being undone, so a retry deletes the rows instead of approving.
  async markApprovalFailing(
    storeId: string,
    approval: ApprovalKey,
    code: CampaignApprovalFailureCode,
    now: Date,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({ approvalFailureCode: code, approvalProgressAt: now })
        .where(approvingWhere(storeId, approval)),
    );
  }

  // Only ids cross RLS: the approval job reads each campaign in its own store.
  async listStalled(before: Date, limit: number) {
    const result = await this.global.execute<{ storeId: string; id: string; approvedAt: Date }>(sql`
      select store_id as "storeId", id, approved_at as "approvedAt"
      from campaign_stalled_approvals(${before.toISOString()}::timestamptz, ${limit}::integer)
    `);
    return result.rows.map(({ approvedAt, ...row }) => ({
      ...row,
      approvedAt: new Date(approvedAt),
    }));
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

  // Returns how many rows went, so a caller can repeat until none are left. The ids are read
  // first: one DELETE with a LIMIT subquery makes Postgres rescan it for every row under RLS.
  async removeRecipientsBatch(storeId: string, campaignId: string, limit: number) {
    return this.database.forStore(storeId, async (tx) => {
      const ids = await tx
        .select({ id: campaignRecipients.id })
        .from(campaignRecipients)
        .where(recipientsWhere(storeId, campaignId))
        .limit(limit);
      if (!ids.length) return 0;
      const rows = await tx
        .delete(campaignRecipients)
        .where(
          and(
            recipientsWhere(storeId, campaignId),
            inArray(
              campaignRecipients.id,
              ids.map(({ id }) => id),
            ),
          ),
        )
        .returning({ id: campaignRecipients.id });
      return rows.length;
    });
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

export type ApprovalState = NonNullable<
  Awaited<ReturnType<CampaignApprovalRepository['findApproval']>>
>;
