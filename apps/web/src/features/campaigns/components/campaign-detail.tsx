'use client';

import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCampaign } from '../api/get-campaign';
import { CampaignBuilder } from './campaign-builder';
import { StorePage } from '@/components/store-page';

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const campaign = useCampaign(campaignId);
  const missing =
    campaign.error instanceof ApiError && campaign.error.code === 'CAMPAIGN_NOT_FOUND';
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
      {campaign.data && !missing && (
        <CampaignBuilder key={campaign.data.id} campaign={campaign.data} />
      )}
    </StorePage>
  );
}
