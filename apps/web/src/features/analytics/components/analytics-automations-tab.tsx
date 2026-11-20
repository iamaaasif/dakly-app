import { ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';

import type { AnalyticsAutomationRow, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { channelLabels } from '../analytics-labels';
import { useAnalyticsAutomations } from '../api/analytics-overview';
import { ChannelTile } from './channel-tile';
import { formatWholeTaka } from '@/lib/format-money';

export function AnalyticsAutomationsTab({ view }: { view: AnalyticsView }) {
  const query = useAnalyticsAutomations(view.period);
  if (query.isPending)
    return <Skeleton role="status" aria-label="Loading automations" className="h-64 w-full" />;
  if (query.error)
    return (
      <QueryError
        message={query.error.message}
        onRetry={() => query.refetch()}
        retryLabel="Retry automations"
      />
    );
  const rows = [...query.data.automations].sort((a, b) =>
    BigInt(b.revenuePoisha) > BigInt(a.revenuePoisha) ? 1 : -1,
  );
  const earned = rows.reduce((sum, row) => sum + BigInt(row.revenuePoisha), 0n);
  const biggest = rows.reduce(
    (max, row) => (BigInt(row.revenuePoisha) > max ? BigInt(row.revenuePoisha) : max),
    1n,
  );
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="text-text-muted">Messages that send on their own.</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-text-muted">Earned on autopilot</p>
          <p className="text-xl font-bold tabular-nums">{formatWholeTaka(earned)}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-text-muted">
          No automation was live in this period. Turn one on from Automations.
        </p>
      ) : (
        <ul aria-label="Automations" className="divide-y divide-border">
          {rows.map((row) => (
            <AutomationRow key={row.id} row={row} biggest={biggest} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AutomationRow({ row, biggest }: { row: AnalyticsAutomationRow; biggest: bigint }) {
  const share = Number((BigInt(row.revenuePoisha) * 100n) / biggest);
  const channels = row.channels.map((channel) => channelLabels[channel]).join(', ');
  return (
    <li className="relative flex items-center gap-3 py-4">
      {row.channels[0] ? (
        <ChannelTile channel={row.channels[0]} />
      ) : (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-muted"
        >
          <Zap size={18} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/automations/${row.id}`}
            className="font-semibold wrap-anywhere text-text after:absolute after:inset-0 hover:underline focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
          >
            {row.name}
          </Link>
          {!row.isActive && <Badge variant="neutral">Paused</Badge>}
        </div>
        <span aria-hidden className="mt-2 block h-1.5 max-w-xl rounded-full bg-surface-muted">
          <span
            className="block h-1.5 rounded-full bg-primary"
            style={{ width: `${Math.max(2, share)}%` }}
          />
        </span>
        <p className="mt-1 text-sm text-text-muted">
          {[
            channels,
            `${formatCount(row.entered)} customers went through it`,
            row.orderedPercent === null ? null : `${row.orderedPercent}% ordered`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">{formatWholeTaka(BigInt(row.revenuePoisha))}</p>
        <p className="text-sm text-text-muted">{formatCount(row.orders)} orders</p>
      </div>
      <ChevronRight aria-hidden="true" size={16} className="text-text-muted" />
    </li>
  );
}
