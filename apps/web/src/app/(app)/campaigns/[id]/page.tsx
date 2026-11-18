import { notFound } from 'next/navigation';
import { z } from 'zod';

import { StorePage } from '@/components/store-page';
import { CampaignDetail } from '@/features/campaigns/components/campaign-detail';
import { requireSession } from '@/lib/require-session';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  return (
    <StorePage permission="canViewCampaigns">
      <CampaignDetail campaignId={parsed.data} />
    </StorePage>
  );
}
