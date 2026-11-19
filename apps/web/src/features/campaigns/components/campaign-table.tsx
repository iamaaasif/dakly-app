import Link from 'next/link';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { Badge } from '@dakly/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import {
  campaignChannelLabels,
  campaignGoalLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { formatDateTime } from '@/lib/format-date';

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
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled for</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id} className="relative">
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="inline-flex min-h-10 min-w-10 items-center font-semibold wrap-anywhere text-action after:absolute after:inset-0 hover:underline focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
                  >
                    {campaign.name}
                  </Link>
                  <CampaignSubtitle campaign={campaign} />
                </TableCell>
                <TableCell>
                  <CampaignStatus status={campaign.status} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {campaign.scheduledFor ? (
                    <time dateTime={campaign.scheduledFor}>
                      {formatDateTime(campaign.scheduledFor)}
                    </time>
                  ) : (
                    '—'
                  )}
                </TableCell>
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
              className="inline-flex min-h-10 min-w-10 items-center font-semibold wrap-anywhere text-action group-hover:underline"
            >
              {campaign.name}
            </span>
            <CampaignSubtitle campaign={campaign} />
          </div>
          <CampaignStatus status={campaign.status} />
        </div>
        {campaign.scheduledFor && (
          <p className="mt-2 text-sm text-text-muted">
            Scheduled for{' '}
            <time dateTime={campaign.scheduledFor}>{formatDateTime(campaign.scheduledFor)}</time>
          </p>
        )}
      </Link>
    </li>
  );
}

function CampaignSubtitle({ campaign }: { campaign: CampaignResponse }) {
  return (
    <p className="text-sm text-text-muted">
      {campaignChannelLabels[campaign.channel]}
      {campaign.goal && ` · ${campaignGoalLabels[campaign.goal]}`}
    </p>
  );
}

function CampaignStatus({ status }: { status: CampaignResponse['status'] }) {
  return <Badge variant={campaignStatusColors[status]}>{campaignStatusLabels[status]}</Badge>;
}
