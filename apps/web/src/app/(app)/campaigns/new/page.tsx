import { StorePage } from '@/components/store-page';
import { CampaignBuilder } from '@/features/campaigns/components/campaign-builder';
import { requireSession } from '@/lib/require-session';

export default async function NewCampaignPage() {
  const session = await requireSession();
  if (!session.currentStore?.canEditCampaigns)
    return (
      <p role="status" className="p-6">
        You do not have permission to create campaigns in this shop.
      </p>
    );
  return (
    <StorePage permission="canEditCampaigns">
      <CampaignBuilder />
    </StorePage>
  );
}
