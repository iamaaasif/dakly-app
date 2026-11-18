import { notFound } from 'next/navigation';
import { z } from 'zod';

import { CampaignDetail } from '@/features/campaigns/components/campaign-detail';
import { requireSession } from '@/lib/require-session';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  if (!session.currentStore?.canViewCampaigns)
    return (
      <p role="status" className="p-6">
        You do not have Campaigns access in this shop.
      </p>
    );
  return <CampaignDetail campaignId={parsed.data} />;
}
