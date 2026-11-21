'use client';

import { useRouter } from 'next/navigation';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { type CampaignCopyKind, useCopyCampaign } from '../api/campaign-results';

// Each button makes a new draft and opens it; the server decides when one is allowed.
export function CampaignCopyActions({ campaign }: { campaign: CampaignResponse }) {
  const router = useRouter();
  const showToast = useToast();
  const copy = useCopyCampaign(campaign.id);
  const isSent = campaign.status === 'sent';
  const make = (kind: CampaignCopyKind) =>
    copy.mutate(kind, {
      onSuccess: (draft) => router.push(`/campaigns/${draft.id}`),
      onError: (error) => showToast(error.message),
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={copy.isPending} onClick={() => make('duplicate')}>
        Duplicate
      </Button>
      {isSent && campaign.channel !== 'sms' ? (
        <Button variant="secondary" disabled={copy.isPending} onClick={() => make('resend')}>
          Resend to people who didn&rsquo;t read
        </Button>
      ) : null}
      {isSent ? (
        <Button variant="secondary" disabled={copy.isPending} onClick={() => make('follow-up')}>
          Create follow-up
        </Button>
      ) : null}
    </div>
  );
}
