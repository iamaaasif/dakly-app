import Link from 'next/link';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { Badge } from '@dakly/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import {
  campaignChannelLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { formatCount, formatMoney } from '@/lib/format-money';

const campaignMetrics = ['Sent', 'Clicked', 'Orders', 'Revenue'] as const;

export function CampaignTable({ campaigns }: { campaigns: CampaignResponse[] }) {
  return (
    <>
      <ul aria-label="Campaigns" className="space-y-3 md:hidden">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </ul>
      <div className="hidden md:block">
        <Table aria-label="Campaigns">
          <TableHeader className="bg-surface uppercase [&_th]:text-text-muted">
            <TableRow>
              <TableHead className="w-1/2">Campaign</TableHead>
              <TableHead>Status</TableHead>
              {campaignMetrics.map((metric) => (
                <TableHead key={metric} className="text-right">
                  {metric}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id} className="relative">
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="inline-flex min-h-10 min-w-10 items-center text-base font-semibold wrap-anywhere text-text after:absolute after:inset-0 hover:underline focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
                  >
                    {campaign.name}
                  </Link>
                  <CampaignSubtitle campaign={campaign} />
                </TableCell>
                <TableCell>
                  <CampaignStatus status={campaign.status} />
                </TableCell>
                {campaignMetrics.map((metric) => (
                  <TableCell key={metric} className="text-right tabular-nums">
                    <CampaignMetric campaign={campaign} metric={metric} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignResponse }) {
  const nameId = `campaign-card-name-${campaign.id}`;
  return (
    <li>
      <Link
        href={`/campaigns/${campaign.id}`}
        aria-labelledby={nameId}
        className="group block rounded-lg border border-border bg-surface px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              id={nameId}
              className="inline-flex min-h-10 min-w-10 items-center text-base font-semibold wrap-anywhere text-text group-hover:underline"
            >
              {campaign.name}
            </span>
            <CampaignSubtitle campaign={campaign} />
          </div>
          <CampaignStatus status={campaign.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {campaignMetrics.map((metric) => (
            <div key={metric} className="flex justify-between gap-2">
              <dt className="text-text-muted">{metric}</dt>
              <dd>
                <CampaignMetric campaign={campaign} metric={metric} />
              </dd>
            </div>
          ))}
        </dl>
      </Link>
    </li>
  );
}

function CampaignSubtitle({ campaign }: { campaign: CampaignResponse }) {
  return <p className="text-sm text-text-muted">{campaignChannelLabels[campaign.channel]}</p>;
}

function CampaignMetric({
  campaign,
  metric,
}: {
  campaign: CampaignResponse;
  metric: (typeof campaignMetrics)[number];
}) {
  const attribution = campaign.attribution;
  if (attribution && campaign.status !== 'draft') {
    if (metric === 'Orders') return formatCount(BigInt(attribution.orders));
    if (metric === 'Revenue') return formatMoney(BigInt(attribution.revenuePoisha));
  }
  return <UnavailableMetric />;
}

function UnavailableMetric() {
  return (
    <>
      <span className="sr-only">Unavailable</span>
      <span aria-hidden="true">—</span>
    </>
  );
}

function CampaignStatus({ status }: { status: CampaignResponse['status'] }) {
  return <Badge variant={campaignStatusColors[status]}>{campaignStatusLabels[status]}</Badge>;
}
