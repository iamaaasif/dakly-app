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
    <Table aria-label="Campaigns">
      <TableHeader>
        <TableRow>
          <TableHead>Campaign</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Scheduled for</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => (
          <TableRow key={campaign.id}>
            <TableCell className="whitespace-normal">
              <Link
                href={`/campaigns/${campaign.id}`}
                className="inline-flex min-h-10 items-center font-semibold wrap-anywhere text-action hover:underline"
              >
                {campaign.name}
              </Link>
              <p className="text-sm text-text-muted">
                {campaignChannelLabels[campaign.channel]}
                {campaign.goal && ` · ${campaignGoalLabels[campaign.goal]}`}
              </p>
              {campaign.scheduledFor && (
                <p className="mt-1 text-sm text-text-muted md:hidden">
                  <time dateTime={campaign.scheduledFor}>
                    {formatDateTime(campaign.scheduledFor)}
                  </time>
                </p>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={campaignStatusColors[campaign.status]}>
                {campaignStatusLabels[campaign.status]}
              </Badge>
            </TableCell>
            <TableCell className="hidden tabular-nums md:table-cell">
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
  );
}
