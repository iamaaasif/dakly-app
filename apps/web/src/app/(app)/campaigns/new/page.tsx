import { StorePage } from '@/components/store-page';
import { CampaignBuilder } from '@/features/campaigns/components/campaign-builder';
import { requireSession } from '@/lib/require-session';

export default async function NewCampaignPage() {
  await requireSession();
  return (
    <StorePage permission="canEditCampaigns">
      <CampaignBuilder />
    </StorePage>
  );
}
