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
          <li key={campaign.id} className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CampaignName campaign={campaign} />
              </div>
              <CampaignStatus status={campaign.status} />
            </div>
            {campaign.scheduledFor && (
              <p className="mt-2 text-sm text-text-muted">
                Scheduled for{' '}
                <time dateTime={campaign.scheduledFor}>
                  {formatDateTime(campaign.scheduledFor)}
                </time>
              </p>
            )}
          </li>
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
              <TableRow key={campaign.id}>
                <TableCell className="whitespace-normal">
                  <CampaignName campaign={campaign} />
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

function CampaignName({ campaign }: { campaign: CampaignResponse }) {
  return (
    <>
      <Link
        href={`/campaigns/${campaign.id}`}
        className="inline-flex min-h-10 min-w-10 items-center font-semibold wrap-anywhere text-action hover:underline"
      >
        {campaign.name}
      </Link>
      <p className="text-sm text-text-muted">
        {campaignChannelLabels[campaign.channel]}
        {campaign.goal && ` · ${campaignGoalLabels[campaign.goal]}`}
      </p>
    </>
  );
}

function CampaignStatus({ status }: { status: CampaignResponse['status'] }) {
  return <Badge variant={campaignStatusColors[status]}>{campaignStatusLabels[status]}</Badge>;
}
