import { recipientSkipReasons, type CampaignChannel } from '@dakly/contracts/campaigns';
import { formatCount } from '@dakly/contracts/money';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCampaignEstimate } from '../api/campaign-estimate';

const skipLabels: Record<(typeof recipientSkipReasons)[number], string> = {
  no_consent: 'have not agreed to messages',
  not_customer: 'are not customers',
  blocked: 'blocked messages',
  no_address: 'never wrote to this Page',
  over_plan_limit: 'are over your plan limit',
  frequency_cap: 'already got a message recently',
  window_closed: 'last wrote more than 23 hours ago',
  meta_user_limit: 'reached Meta limit for one person',
  do_not_call: 'asked not to be contacted',
  daily_reach_limit: 'are over the daily reach limit',
  no_credits: 'are over your credits',
};

// A Messenger count is often far below the audience, because a Page may message only people who
// wrote or tapped a button in the last 24 hours.
export function CampaignEstimate({
  campaignId,
  savedAt,
  channel,
}: {
  campaignId: string;
  savedAt: string;
  channel: Extract<CampaignChannel, 'sms' | 'messenger'>;
}) {
  const { data, isPending, isError } = useCampaignEstimate(campaignId, savedAt);
  if (isPending) return <Skeleton className="h-28 w-full" />;
  if (isError) return <p role="alert">The estimate could not load. Try again soon.</p>;
  return (
    <section
      aria-label="Estimate"
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <dl className="space-y-2">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Audience</dt>
          <dd>
            {formatCount(data.audienceCount)}
            {!data.isComplete && '+'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Will receive</dt>
          <dd className="font-semibold">
            {formatCount(data.recipientsCount)}
            {!data.isComplete && '+'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Estimated cost</dt>
          <dd>{channel === 'sms' ? `${formatCount(data.smsCredits)} SMS credits` : 'Free'}</dd>
        </div>
      </dl>
      {(channel === 'messenger' || Object.values(data.skippedByReason).some(Boolean)) && (
        <div className="space-y-1 border-t border-border pt-3 text-sm text-text-muted">
          {channel === 'messenger' && (
            <p>
              Messenger only allows a message to people who wrote to your Page or tapped a button in
              the last 24 hours. Dakly checks this again when each message goes out.
            </p>
          )}
          <SkippedList counts={data.skippedByReason} channel={channel} />
        </div>
      )}
    </section>
  );
}

function SkippedList({
  counts,
  channel,
}: {
  counts: Partial<Record<(typeof recipientSkipReasons)[number], number>>;
  channel: CampaignChannel;
}) {
  const skipped = recipientSkipReasons
    .map((reason) => ({ reason, count: counts[reason] ?? 0 }))
    .filter(({ count }) => count > 0);
  if (!skipped.length) return null;
  return (
    <ul className="list-disc pl-5">
      {skipped.map(({ reason, count }) => (
        <li key={reason}>
          {formatCount(count)}{' '}
          {channel === 'sms' && reason === 'no_address'
            ? 'have no phone number'
            : skipLabels[reason]}
        </li>
      ))}
    </ul>
  );
}
