'use client';

import { Button } from '@dakly/ui/button';

import { useSessionContext } from '@/lib/session-context';

import { useCampaignResults } from '../api/campaign-results';
import { useCampaign } from '../api/get-campaign';
import { CampaignBuilder } from './campaign-builder';
import { CampaignCopyActions } from './campaign-copy-actions';
import { CampaignCustomers } from './campaign-customers';
import { CampaignLoading } from './campaign-loading';
import { CampaignResults } from './campaign-results';

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const campaign = useCampaign(campaignId);
  const results = useCampaignResults(campaignId);
  const canEdit = useSessionContext().data?.currentStore?.canEditCampaigns === true;
  if (campaign.isPending) return <CampaignLoading />;
  if (campaign.isError)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>{campaign.error.message}</p>
        <Button variant="secondary" onClick={() => void campaign.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!campaign.data)
    return (
      <p role="alert" className="p-6">
        Campaign not found
      </p>
    );
  // A campaign cancelled before it sent anything has no results to show.
  if (campaign.data.startedAt !== null)
    return (
      <CampaignResults
        campaign={campaign.data}
        results={results.data}
        actions={canEdit ? <CampaignCopyActions campaign={campaign.data} /> : null}
        customers={<CampaignCustomers campaignId={campaignId} channel={campaign.data.channel} />}
      />
    );
  return <CampaignBuilder key={campaign.data.id} campaign={campaign.data} />;
}
