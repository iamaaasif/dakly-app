import type { CampaignResponse } from '@dakly/contracts/campaigns';

// Only the segment lists that differ from the saved draft go into the change, so an untouched
// audience is never sent again.
export function changedAudience(
  campaign: CampaignResponse,
  input: { includeSegmentIds: string[]; excludeSegmentIds: string[] },
) {
  const sameIds = (saved: string[], next: string[]) =>
    saved.length === next.length && saved.every((id) => next.includes(id));
  return {
    ...(!sameIds(campaign.includeSegmentIds, input.includeSegmentIds) && {
      includeSegmentIds: input.includeSegmentIds,
    }),
    ...(!sameIds(campaign.excludeSegmentIds, input.excludeSegmentIds) && {
      excludeSegmentIds: input.excludeSegmentIds,
    }),
  };
}
