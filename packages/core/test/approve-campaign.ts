import type { Pool } from 'pg';

import type { CampaignApprovalService } from '../src/campaigns/campaign-approval.service';

// Approval is a request and then a job. This runs the job to its end, as the worker would.
export async function runApprovalJob(
  approval: CampaignApprovalService,
  pool: Pool,
  storeId: string,
  campaignId: string,
): Promise<void> {
  const { rows } = await pool.query<{ approved_at: Date }>(
    'select approved_at from campaigns where id = $1',
    [campaignId],
  );
  const key = { id: campaignId, approvedAt: rows[0]!.approved_at };
  while (await approval.build(storeId, key));
}
