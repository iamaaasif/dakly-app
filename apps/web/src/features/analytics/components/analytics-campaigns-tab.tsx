import { ArrowDown, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { AnalyticsCampaignRow, AnalyticsView } from '@dakly/contracts/analytics';
import { campaignChannels } from '@dakly/contracts/campaigns';
import { formatCount } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Skeleton } from '@dakly/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { visibleCampaigns } from '../analytics-campaign-rows';
import { channelLabels } from '../analytics-labels';
import { analyticsHref, useAnalyticsCampaigns } from '../api/analytics-overview';
import { ChannelTile } from './channel-tile';
import { formatShortDate } from '@/lib/format-date';
import { formatWholeTaka } from '@/lib/format-money';

const columns = [
  { sort: 'date', label: 'Date' },
  { sort: 'sent', label: 'Sent to' },
  { sort: 'tapped', label: 'Tapped' },
  { sort: 'orders', label: 'Orders' },
  { sort: 'earned', label: 'Earned' },
  { sort: 'return', label: 'Return' },
] as const;

export function AnalyticsCampaignsTab({
  view,
  timeZone,
}: {
  view: AnalyticsView;
  timeZone: string;
}) {
  const query = useAnalyticsCampaigns(view.period);
  if (query.isPending)
    return <Skeleton role="status" aria-label="Loading campaigns" className="h-64 w-full" />;
  if (query.error)
    return (
      <QueryError
        message={query.error.message}
        onRetry={() => query.refetch()}
        retryLabel="Retry campaigns"
      />
    );
  const rows = visibleCampaigns(query.data.campaigns, view);
  const earned = rows.reduce((sum, row) => sum + BigInt(row.revenuePoisha), 0n);
  return (
    <Card className="space-y-4">
      <Toolbar view={view} count={rows.length} earned={earned} />
      {rows.length === 0 ? (
        <p className="py-8 text-center text-text-muted">
          No campaigns were sent in this period
          {view.search || view.channel !== 'all' ? ' that match' : ''}.
        </p>
      ) : (
        <>
          <ul aria-label="Campaigns" className="space-y-3 md:hidden">
            {rows.map((row) => (
              <CampaignCard key={row.id} row={row} timeZone={timeZone} />
            ))}
          </ul>
          <CampaignTable rows={rows} view={view} timeZone={timeZone} />
        </>
      )}
    </Card>
  );
}

function Toolbar({ view, count, earned }: { view: AnalyticsView; count: number; earned: bigint }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:w-72">
        <Search
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          type="search"
          aria-label="Search campaigns"
          placeholder="Search campaigns"
          defaultValue={view.search}
          className="pl-9"
          onChange={(event) =>
            router.replace(analyticsHref({ ...view, search: event.target.value }), {
              scroll: false,
            })
          }
        />
      </div>
      <Select
        value={view.channel}
        onValueChange={(channel) =>
          router.replace(analyticsHref({ ...view, channel: channel as AnalyticsView['channel'] }), {
            scroll: false,
          })
        }
      >
        <SelectTrigger aria-label="Channel" className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All channels</SelectItem>
          {campaignChannels.map((channel) => (
            <SelectItem key={channel} value={channel}>
              {channelLabels[channel]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-text-muted sm:ml-auto">
        {formatCount(count)} {count === 1 ? 'campaign' : 'campaigns'} · {formatWholeTaka(earned)}{' '}
        earned
      </p>
    </div>
  );
}

function CampaignTable({
  rows,
  view,
  timeZone,
}: {
  rows: AnalyticsCampaignRow[];
  view: AnalyticsView;
  timeZone: string;
}) {
  return (
    <div className="hidden md:block">
      <Table aria-label="Campaigns">
        <TableHeader className="bg-surface-muted/50 uppercase [&_th]:text-text-muted">
          <TableRow>
            <TableHead className="w-1/3">
              <SortLink view={view} sort="name" label="Campaign" />
            </TableHead>
            {columns.map(({ sort, label }) => (
              <TableHead key={sort} className="text-right">
                <SortLink view={view} sort={sort} label={label} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="relative">
              <TableCell className="whitespace-normal">
                <div className="flex items-center gap-3">
                  <ChannelTile channel={row.channel} />
                  <CampaignName row={row} />
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatShortDate(row.startedAt, timeZone)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.sent)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {percentText(row.tapPercent)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.orders)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatWholeTaka(BigInt(row.revenuePoisha))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {returnText(row.returnPerTaka)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortLink({
  view,
  sort,
  label,
}: {
  view: AnalyticsView;
  sort: AnalyticsView['sort'];
  label: string;
}) {
  const active = view.sort === sort;
  return (
    <Link
      href={analyticsHref({ ...view, sort })}
      aria-label={`Sort by ${label}`}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-10 items-center gap-1 uppercase hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        active && 'text-text',
      )}
    >
      {label}
      {active && <ArrowDown aria-hidden="true" size={14} strokeWidth={1.75} />}
    </Link>
  );
}

function CampaignName({ row }: { row: AnalyticsCampaignRow }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/campaigns/${row.id}`}
        className="font-semibold wrap-anywhere text-text after:absolute after:inset-0 hover:underline focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
      >
        {row.name}
      </Link>
      <p className="text-sm text-text-muted">{channelLabels[row.channel]}</p>
    </div>
  );
}

function CampaignCard({ row, timeZone }: { row: AnalyticsCampaignRow; timeZone: string }) {
  const facts = [
    ['Sent to', formatCount(row.sent)],
    ['Tapped', percentText(row.tapPercent)],
    ['Orders', formatCount(row.orders)],
    ['Return', returnText(row.returnPerTaka)],
  ] as const;
  return (
    <li className="relative rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <ChannelTile channel={row.channel} />
        <CampaignName row={row} />
        <div className="ml-auto text-right">
          <p className="font-semibold tabular-nums">{formatWholeTaka(BigInt(row.revenuePoisha))}</p>
          <p className="text-sm text-text-muted">{formatShortDate(row.startedAt, timeZone)}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-text-muted">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

const percentText = (percent: number | null) => (percent === null ? '—' : `${percent}%`);
const returnText = (taka: number | null) =>
  taka === null ? 'Free' : formatWholeTaka(BigInt(taka) * 100n);
