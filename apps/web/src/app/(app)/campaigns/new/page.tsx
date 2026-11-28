import { z } from 'zod';

import { StorePage } from '@/components/store-page';
import { CampaignBuilder } from '@/features/campaigns/components/campaign-builder';
import { requireSession } from '@/lib/require-session';

// Send campaign on the customer list opens this page with the segment it just made.
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  await requireSession();
  const { segment } = await searchParams;
  const startingSegmentId = z.uuid().safeParse(segment).data;
  return (
    <StorePage permission="canEditCampaigns">
      <CampaignBuilder startingSegmentId={startingSegmentId} />
    </StorePage>
  );
}
