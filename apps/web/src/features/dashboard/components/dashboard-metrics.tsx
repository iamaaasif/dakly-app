import { Repeat2, ShoppingBag, TrendingDown, TrendingUp, UserRoundPlus } from 'lucide-react';

import type { DashboardResponse } from '@dakly/contracts/dashboard';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

import { formatWholeTaka } from '@/lib/format-money';

const metrics = [
  {
    id: 'marketingRevenue',
    title: 'Money from Dakly messages',
    icon: ShoppingBag,
    color: 'text-action-hover',
    fill: 'bg-primary-soft',
    description: 'Item totals from attributed orders, including returns up to today.',
  },
  {
    id: 'customersWhoCameBack',
    title: 'Customers who came back',
    icon: Repeat2,
    color: 'text-success',
    fill: 'bg-success-soft',
    description: 'Customers who bought before this period and ordered again.',
  },
  {
    id: 'newCustomers',
    title: 'New customers',
    icon: UserRoundPlus,
    color: 'text-info',
    fill: 'bg-info-soft',
    description: 'Customers who placed their first order in this period.',
  },
  {
    id: 'orders',
    title: 'Orders',
    icon: TrendingUp,
    color: 'text-text',
    fill: 'bg-surface-muted',
    description: 'Orders from all sources, excluding cancelled orders.',
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: ShoppingBag,
    color: 'text-action-hover',
    fill: 'bg-primary-soft',
    description: 'Item totals after discounts, excluding delivery.',
  },
] as const;

type MetricsProps = { cards: DashboardResponse['cards']; period: number };

export function DashboardMetrics({ cards, period }: MetricsProps) {
  return (
    <section
      aria-label="Key figures"
      className={cn(
        'grid gap-4 sm:grid-cols-2',
        metrics.every(({ id }) => cards[id]) ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
      )}
    >
      {metrics.map(({ id, title, icon: Icon, color, fill, description }) => {
        const card = cards[id];
        if (!card) return null;
        const sales = 'totalPoisha' in card;
        const total = BigInt(sales ? card.totalPoisha : card.total);
        const previous = BigInt(sales ? card.previousPoisha : card.previous);
        const points = sales ? card.pointsPoisha : card.points;
        const amount = sales ? formatWholeTaka(total) : formatCount(total);
        return (
          <Card key={id} className="flex min-w-0 flex-col gap-3 p-4">
            <h2 className="flex items-center gap-2 text-md font-semibold xl:gap-1 xl:tracking-tight">
              <span className={cn('shrink-0 rounded-md p-2 xl:p-1', color, fill)}>
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              </span>
              {title}
            </h2>
            <div className="flex min-w-0 items-end gap-2">
              <p className="min-w-0 truncate text-xl font-bold tabular-nums" title={amount}>
                {amount}
              </p>
              <Sparkline points={points} className={color} />
            </div>
            <ReportChange total={total} previous={previous} period={period} />
            <p className="mt-auto border-t border-border pt-3 text-sm text-text-muted">
              {id === 'orders' && total === 0n ? 'No orders in this period.' : description}
            </p>
          </Card>
        );
      })}
    </section>
  );
}

type Comparison = { total: bigint; previous: bigint; period: number };

function ReportChange({ total, previous, period }: Comparison) {
  let variant: 'neutral' | 'success' | 'danger' = 'neutral';
  if (previous > 0n && total !== previous) variant = total > previous ? 'success' : 'danger';
  const Trend = variant === 'success' ? TrendingUp : TrendingDown;
  const label = variant === 'success' ? 'Up' : 'Down';
  const icon = <Trend role="img" aria-label={label} size={16} strokeWidth={1.75} />;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
      <Badge variant={variant} className="gap-1 rounded-full tabular-nums">
        {variant !== 'neutral' && icon}
        {change(total, previous)}
      </Badge>
      <span>vs previous {period} days</span>
    </div>
  );
}

function change(total: bigint, previous: bigint) {
  if (previous === 0n) return 'New';
  const delta = total - previous;
  if (delta === 0n) return '0.0%';
  const magnitude = delta < 0n ? -delta : delta;
  const tenths = (magnitude * 1000n + previous / 2n) / previous;
  return `${delta < 0n ? '-' : '+'}${formatCount(tenths / 10n)}.${tenths % 10n}%`;
}

function Sparkline({ points, className }: { points: string[]; className: string }) {
  const values = points.map(Number);
  const max = Math.max(1, ...values);
  const trend = values
    .map((value, index) => `${(index * 80) / (values.length - 1)},${28 - (value / max) * 26}`)
    .join(' ');
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 30"
      preserveAspectRatio="none"
      className={cn('mb-1 ml-auto h-8 w-0 max-w-20 min-w-6 flex-1', className)}
    >
      <polygon points={`0,30 ${trend} 80,30`} fill="currentColor" opacity="0.1" />
      <polyline
        points={trend}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const groups = [
  { key: 'stopped_buying', name: 'Stopped buying', color: 'bg-danger' },
  { key: 'slipping_away', name: 'Slipping away', color: 'bg-warning' },
  { key: 'bought_once', name: 'Bought once', color: 'bg-primary' },
  { key: 'new', name: 'New', color: 'bg-info' },
  { key: 'regulars', name: 'Regulars', color: 'bg-success' },
  { key: 'best', name: 'Best customers', color: 'bg-text' },
] as const;

export function LifecycleGroups({
  counts,
}: {
  counts: NonNullable<DashboardResponse['lifecycle']>;
}) {
  const total = groups.reduce((sum, { key }) => sum + counts[key], 0);
  return (
    <Card role="region" aria-labelledby="lifecycle-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="lifecycle-heading" className="text-lg font-semibold">
          Your customers at a glance
        </h2>
        <p className="text-sm text-text-muted tabular-nums">
          {formatCount(total)} {total === 1 ? 'customer' : 'customers'}
        </p>
      </div>
      <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        {total > 0 &&
          groups.map(({ key, color }) => (
            <span
              key={key}
              className={color}
              style={{ width: `${(counts[key] / total) * 100}%` }}
            />
          ))}
      </div>
      <dl className="grid gap-x-8 md:grid-cols-2">
        {groups.map(({ key, name, color }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 border-b border-border py-3"
          >
            <dt className="flex items-center gap-2">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', color)} />
              {name}
            </dt>
            <dd className="font-semibold tabular-nums">{formatCount(counts[key])}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
