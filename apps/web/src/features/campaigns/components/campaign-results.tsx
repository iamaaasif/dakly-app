import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { Badge } from '@dakly/ui/badge';

import {
  campaignChannelLabels,
  campaignGoalLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { BuilderHeader } from './campaign-builder';
import { CampaignFunnel } from './campaign-funnel';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { formatCount, formatMoney } from '@/lib/format-money';

const DAY_MS = 24 * 60 * 60 * 1000;
// Orders count towards a campaign for 7 days after it finishes (feature 09, States).
const ORDER_WINDOW_DAYS = 7;

export function CampaignResults({ campaign }: { campaign: CampaignResponse }) {
  const { counts, channel } = campaign;
  const orders = BigInt(campaign.attribution?.orders ?? '0');
  const revenue = BigInt(campaign.attribution?.revenuePoisha ?? '0');
  // Only WhatsApp and email report reads; an SMS has no read receipt.
  const reads = channel === 'sms' ? [] : [{ label: 'Read', count: counts.read }];
  const cards = [
    { label: 'Sent', value: formatCount(counts.sent) },
    { label: 'Delivered', value: formatCount(counts.delivered) },
    ...reads.map(({ label, count }) => ({ label, value: formatCount(count) })),
    { label: 'Tapped link', value: formatCount(counts.tapped) },
    { label: 'Failed', value: formatCount(counts.failed) },
    { label: 'Orders', value: formatCount(orders) },
    { label: 'Revenue', value: formatMoney(revenue) },
  ];
  return (
    <main className="space-y-6 p-6 md:p-8">
      <BuilderHeader
        title={campaign.name}
        subtitle={`${campaignChannelLabels[channel]} · ${whenSent(campaign)}`}
        action={
          <Badge variant={campaignStatusColors[campaign.status]}>
            {campaignStatusLabels[campaign.status]}
          </Badge>
        }
      />
      <section aria-labelledby="results-heading" className="space-y-4">
        <h2 id="results-heading" className="text-lg font-semibold">
          Campaign results
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-4">
              <dt className="text-sm text-text-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ResultNotes campaign={campaign} />
      </section>
      <section aria-labelledby="funnel-heading" className="max-w-xl space-y-3">
        <h2 id="funnel-heading" className="text-lg font-semibold">
          Funnel
        </h2>
        <CampaignFunnel
          steps={[
            { label: 'Sent', count: counts.sent },
            { label: 'Delivered', count: counts.delivered },
            ...reads,
            { label: 'Tapped link', count: counts.tapped },
            { label: 'Ordered', count: Number(orders) },
          ]}
        />
      </section>
      <CampaignMessage campaign={campaign} />
    </main>
  );
}

function whenSent({ status, startedAt, finishedAt, createdAt }: CampaignResponse) {
  if (status === 'sent' && finishedAt) return `Sent ${formatDateTime(finishedAt)}`;
  return startedAt
    ? `Started ${formatDateTime(startedAt)}`
    : `Created ${formatDateTime(createdAt)}`;
}

function ResultNotes({ campaign }: { campaign: CampaignResponse }) {
  const finalOn = campaign.finishedAt
    ? new Date(Date.parse(campaign.finishedAt) + ORDER_WINDOW_DAYS * DAY_MS)
    : undefined;
  const now = new Date();
  return (
    <div className="space-y-1 text-sm text-text-muted">
      <p>Orders and revenue include returns up to today.</p>
      {finalOn && finalOn > now ? (
        <p>Results final on {formatDate(finalOn.toISOString(), now.toISOString())}.</p>
      ) : null}
      {campaign.counts.countedAt === null ? <p role="status">Counts are being updated.</p> : null}
    </div>
  );
}

function CampaignMessage({ campaign }: { campaign: CampaignResponse }) {
  return (
    <section aria-label="Saved campaign" className="max-w-xl space-y-3">
      <h2 className="text-lg font-semibold">Details</h2>
      <dl className="space-y-3">
        <div>
          <dt className="text-sm text-text-muted">Audience</dt>
          <dd>
            {formatCount(campaign.counts.recipients)} customers
            {campaign.counts.skipped ? `, ${formatCount(campaign.counts.skipped)} skipped` : ''}
          </dd>
        </div>
        {campaign.goal ? (
          <div>
            <dt className="text-sm text-text-muted">Goal</dt>
            <dd>{campaignGoalLabels[campaign.goal]}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-text-muted">Text</dt>
          <dd className="break-words whitespace-pre-wrap">{campaign.content.text}</dd>
        </div>
      </dl>
    </section>
  );
}
