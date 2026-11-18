'use client';

import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCampaign } from '../api/get-campaign';
import { CampaignBuilder } from './campaign-builder';
import { StorePage } from '@/components/store-page';

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const campaign = useCampaign(campaignId);
  return (
    <StorePage permission="canViewCampaigns">
      {campaign.isPending && (
        <div className="p-6">
          <Skeleton className="h-40" aria-label="Loading campaign" />
        </div>
      )}
      {campaign.isError && (
        <div role="alert" className="space-y-3 p-6">
          <p>{campaign.error.message}</p>
          <Button variant="secondary" onClick={() => void campaign.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {campaign.data === null && (
        <p role="alert" className="p-6">
          Campaign not found
        </p>
      )}
      {campaign.data && (
        <div hidden={campaign.isError}>
          <CampaignBuilder key={campaign.data.id} campaign={campaign.data} />
        </div>
      )}
    </StorePage>
  );
}
