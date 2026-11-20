import type { CampaignResponse, CampaignSourceOutcome } from '@dakly/contracts/campaigns';

import type { Campaign } from './campaigns.repository';

export function toCampaignResponse({
  recipientsCount,
  skippedCount,
  sentCount,
  deliveredCount,
  readCount,
  tappedCount,
  failedCount,
  countsAt,
  approvalCheckedCount,
  approvalEstimatedTotal,
  sourceCampaignId,
  sourceOutcome,
  ...campaign
}: Campaign): CampaignResponse {
  return {
    ...campaign,
    approval:
      campaign.status === 'approving'
        ? { checked: approvalCheckedCount, estimatedTotal: approvalEstimatedTotal }
        : null,
    source: toSource(sourceCampaignId, sourceOutcome),
    scheduledFor: campaign.scheduledFor?.toISOString() ?? null,
    startedAt: campaign.startedAt?.toISOString() ?? null,
    finishedAt: campaign.finishedAt?.toISOString() ?? null,
    counts: {
      recipients: recipientsCount,
      skipped: skippedCount,
      sent: sentCount,
      delivered: deliveredCount,
      read: readCount,
      tapped: tappedCount,
      failed: failedCount,
      countedAt: countsAt?.toISOString() ?? null,
    },
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function toSource(
  campaignId: string | null,
  outcome: CampaignSourceOutcome | null,
): CampaignResponse['source'] {
  return campaignId && outcome ? { campaignId, outcome } : null;
}
