import type { ReactNode } from 'react';

import type { CampaignResponse, CampaignResultsResponse } from '@dakly/contracts/campaigns';
import { formatCount, formatMoney } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';

import {
  campaignChannelLabels,
  campaignGoalLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { CampaignFailures } from './campaign-failures';
import { CampaignFunnel } from './campaign-funnel';
import { CampaignPageHeader } from './campaign-page-header';
import { formatDateTime } from '@/lib/format-date';

type CampaignResultsProps = {
  campaign: CampaignResponse;
  // Cost, return and failures come from a second request; the counts above render without it.
  results?: CampaignResultsResponse;
  actions?: ReactNode;
  customers?: ReactNode;
};

export function CampaignResults({ campaign, results, actions, customers }: CampaignResultsProps) {
  const { counts, channel } = campaign;
  const orders = BigInt(campaign.attribution?.orders ?? '0');
  // Only WhatsApp and email report reads; an SMS has no read receipt.
  const reads = channel === 'sms' ? [] : [{ label: 'Read', count: counts.read }];
  const cards = resultCards(campaign, results);
  return (
    <main className="space-y-6 p-6 md:p-8">
      <CampaignPageHeader
        title={campaign.name}
        subtitle={`${campaignChannelLabels[channel]} · ${whenSent(campaign)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={campaignStatusColors[campaign.status]}>
              {campaignStatusLabels[campaign.status]}
            </Badge>
            {actions}
          </div>
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
        <ResultNotes campaign={campaign} results={results} />
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
      {results ? <CampaignFailures results={results} /> : null}
      {customers}
      <CampaignMessage campaign={campaign} />
    </main>
  );
}

function resultCards(campaign: CampaignResponse, results?: CampaignResultsResponse) {
  const { counts, channel } = campaign;
  const orders = BigInt(campaign.attribution?.orders ?? '0');
  const revenue = BigInt(campaign.attribution?.revenuePoisha ?? '0');
  const reads = channel === 'sms' ? [] : [{ label: 'Read', value: formatCount(counts.read) }];
  const cards = [
    { label: 'Sent', value: formatCount(counts.sent) },
    { label: 'Delivered', value: formatCount(counts.delivered) },
    ...reads,
    { label: 'Tapped link', value: formatCount(counts.tapped) },
    { label: 'Failed', value: formatCount(counts.failed) },
    { label: 'Orders', value: formatCount(orders) },
    { label: 'Revenue', value: formatMoney(revenue) },
  ];
  if (!results) return cards;
  const { costPoisha, returnPerTaka } = results;
  const returned = returnPerTaka === null ? '—' : formatMoney(BigInt(returnPerTaka) * 100n);
  return [
    ...cards,
    { label: 'Cost', value: formatMoney(BigInt(costPoisha)) },
    { label: 'Return per ৳1', value: returned },
  ];
}

function whenSent({ status, startedAt, finishedAt, createdAt }: CampaignResponse) {
  if (status === 'sent' && finishedAt) return `Sent ${formatDateTime(finishedAt)}`;
  return startedAt
    ? `Started ${formatDateTime(startedAt)}`
    : `Created ${formatDateTime(createdAt)}`;
}

function ResultNotes({
  campaign,
  results,
}: {
  campaign: CampaignResponse;
  results?: CampaignResultsResponse;
}) {
  return (
    <div className="space-y-1 text-sm text-text-muted">
      <p>Orders and revenue include returns up to today.</p>
      {results?.resultsFinalAt ? (
        <p>Results final on {formatDateTime(results.resultsFinalAt)}</p>
      ) : null}
      {campaign.counts.countedAt === null ? <p role="status">Counts are being updated.</p> : null}
    </div>
  );
}

function CampaignMessage({ campaign }: { campaign: CampaignResponse }) {
  return (
    <section aria-labelledby="details-heading" className="max-w-xl space-y-3">
      <h2 id="details-heading" className="text-lg font-semibold">
        Details
      </h2>
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
