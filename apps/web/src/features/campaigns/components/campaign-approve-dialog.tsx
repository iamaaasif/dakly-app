'use client';

import { useState, type ReactNode } from 'react';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { formatCount } from '@dakly/contracts/money';
import type { WalletBalancesResponse } from '@dakly/contracts/wallets';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Dialog } from '@dakly/ui/dialog';
import { Skeleton } from '@dakly/ui/skeleton';

import { useApproveCampaign } from '../api/approve-campaign';
import { useCampaignEstimate } from '../api/campaign-estimate';
import { useSendCampaignTest } from '../api/send-campaign-test';
import { campaignChannelLabels } from '../campaign-labels';
import { formatDateTime } from '@/lib/format-date';
import { useSmsBalance } from '@/lib/sms-balance';

// Mounted only while open, so the estimate and balance are read when the owner reaches this point.
export function CampaignApproveDialog({
  campaign,
  onClose,
}: {
  campaign: CampaignResponse;
  onClose: () => void;
}) {
  const approve = useApproveCampaign();
  const estimate = useCampaignEstimate(campaign.id, campaign.updatedAt);
  const balance = useSmsBalance(campaign.channel === 'sms');
  const [reviewed, setReviewed] = useState(false);
  const costsMore =
    balance.data !== undefined &&
    estimate.data !== undefined &&
    balance.data.smsCredits < estimate.data.smsCredits;
  return (
    <Dialog title="Approve this campaign?" open closeDisabled={approve.isPending} onClose={onClose}>
      <div className="space-y-4">
        <Lead campaign={campaign} />
        <Summary
          campaign={campaign}
          estimate={estimate}
          balance={balance.data}
          costsMore={costsMore}
        />
        {campaign.channel === 'sms' && <TestSend campaignId={campaign.id} />}
        <label className="flex items-start gap-3 rounded-md border border-border p-3">
          <Checkbox
            className="mt-0.5"
            checked={reviewed}
            onCheckedChange={(value) => setReviewed(value === true)}
          />
          <span>
            I have reviewed the audience and the message. Messages cannot be recalled once sent.
          </span>
        </label>
        {approve.error && (
          <p role="alert" className="text-danger">
            {approve.error.message}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="secondary" disabled={approve.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={approve.isPending}
            disabled={!reviewed || costsMore}
            onClick={() => approve.mutate(campaign.id)}
          >
            {campaign.scheduledFor ? 'Approve and schedule' : 'Approve and send'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TestSend({ campaignId }: { campaignId: string }) {
  const test = useSendCampaignTest();
  return (
    <div className="space-y-1">
      <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate(campaignId)}>
        Send a test SMS to my phone
      </Button>
      {test.isSuccess && (
        <p role="status" className="text-sm text-text-muted">
          Test sent to your phone number. Links in a test do not open.
        </p>
      )}
      {test.error && (
        <p role="alert" className="text-sm text-danger">
          {test.error.message}
        </p>
      )}
    </div>
  );
}

// A successful approval turns the draft into an approving campaign, which closes the builder and
// this dialog with it.
function Lead({ campaign }: { campaign: CampaignResponse }) {
  const when = campaign.scheduledFor
    ? formatDateTime(campaign.scheduledFor)
    : 'right after you approve';
  return (
    <p>
      “{campaign.name}” will go out on {campaignChannelLabels[campaign.channel]}, {when}.
    </p>
  );
}

function Summary({
  campaign,
  estimate,
  balance,
  costsMore,
}: {
  campaign: CampaignResponse;
  estimate: ReturnType<typeof useCampaignEstimate>;
  balance: WalletBalancesResponse | undefined;
  costsMore: boolean;
}) {
  if (estimate.isPending) return <Skeleton className="h-28 w-full" />;
  if (estimate.isError) return <p role="alert">The estimate could not load. Try again soon.</p>;
  const { data } = estimate;
  const plus = data.isComplete ? '' : '+';
  return (
    <div className="space-y-2">
      <dl className="space-y-2 rounded-md bg-surface-muted p-3">
        <Row label="Customers">
          {formatCount(data.recipientsCount)}
          {plus}
        </Row>
        <Row label="Channel">{campaignChannelLabels[campaign.channel]}</Row>
        <Row label="Estimated cost">
          {campaign.channel === 'sms' ? `${formatCount(data.smsCredits)} SMS credits` : 'Free'}
        </Row>
        {balance && <Row label="Your balance">{formatCount(balance.smsCredits)} SMS credits</Row>}
      </dl>
      {costsMore && (
        <p role="alert" className="text-danger">
          Your balance is lower than the cost. Buy more SMS credits before you approve.
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
