import Link from 'next/link';
import type { ReactNode } from 'react';

import type { DashboardResponse } from '@dakly/contracts/dashboard';
import { formatCount } from '@dakly/contracts/money';
import type { SessionContext } from '@dakly/contracts/sessions';
import { cn } from '@dakly/ui/cn';

import { formatWholeTaka } from '@/lib/format-money';

export type DashboardActivity = {
  chatsWaiting?: number;
  ordersToConfirm?: number;
  ordersToPack?: number;
};

type OverviewProps = {
  data?: DashboardResponse;
  period: number;
  activity: DashboardActivity;
  store: NonNullable<SessionContext['currentStore']>;
};

type OverviewTileDetails = {
  title: string;
  value: string;
  detail: ReactNode;
  href?: string;
  count?: number;
};

function reportChangeText(total: bigint, previous: bigint) {
  if (previous === 0n) return 'New';
  const delta = total - previous;
  if (delta === 0n) return '0.0%';
  const magnitude = delta < 0n ? -delta : delta;
  const tenths = (magnitude * 1000n + previous / 2n) / previous;
  return `${delta < 0n ? '-' : '+'}${formatCount(tenths / 10n)}.${tenths % 10n}%`;
}

function SalesChange({
  sales,
  period,
}: {
  sales: NonNullable<DashboardResponse['cards']['sales']>;
  period: number;
}) {
  const last = BigInt(sales.previousPoisha);
  const current = BigInt(sales.totalPoisha);
  if (!last) return <span>In the last {period} days</span>;
  const comparison = `vs previous ${period} days`;
  return (
    <span
      className={cn(
        current > last && 'text-dashboard-positive',
        current < last && 'text-dashboard-attention',
      )}
    >
      {reportChangeText(current, last)}{' '}
      <span className="sr-only @min-[550px]/dashboard:not-sr-only">{comparison}</span>
    </span>
  );
}

export function DashboardOverview({ data, period, activity, store }: OverviewProps) {
  const sales = data?.cards.sales;
  const recentSales = sales?.pointsPoisha.slice(-2).reduce((sum, point) => sum + BigInt(point), 0n);
  const { chatsWaiting } = activity;
  const newOrders = countNewOrders(activity);
  const tiles = overviewTiles({ sales, period, store, newOrders, chatsWaiting }).filter(
    (tile) => tile !== undefined && tile !== false,
  );
  return (
    <section
      aria-label="Shop overview"
      className={cn(
        'relative grid items-center gap-6 overflow-hidden rounded-dashboard-hero bg-dashboard-hero p-5.5 text-on-primary @min-[920px]/dashboard:p-8',
        tiles.length > 0 && '@min-[920px]/dashboard:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-30 size-105 rounded-full bg-radial-[circle] from-primary/20 to-transparent to-65%"
      />
      <div className="relative flex min-w-0 flex-col items-start gap-3">
        <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-on-primary/8 px-3 text-dashboard-label font-semibold text-on-primary/85">
          <span aria-hidden="true" className="size-1.75 rounded-full bg-dashboard-positive" />
          {store.canViewChats ? 'Your AI sales assistant' : 'Shop overview'}
        </span>
        <h2 className="text-lg leading-tight font-bold tracking-tight text-balance @min-[580px]/dashboard:text-xl">
          {recentSales === undefined
            ? 'Here’s what’s happening in your shop.'
            : `${formatWholeTaka(recentSales)} in sales since yesterday.`}
        </h2>
        <p className="text-base text-on-primary/70">{activitySummary(newOrders, chatsWaiting)}</p>
      </div>
      <OverviewTiles tiles={tiles} />
    </section>
  );
}

const compactPositions = [[], ['single'], ['left', 'right'], ['lead', 'left', 'right']] as const;

function OverviewTiles({ tiles }: { tiles: OverviewTileDetails[] }) {
  if (!tiles.length) return null;
  const positions = compactPositions[tiles.length];
  return (
    <div
      className={cn(
        'relative grid grid-cols-2 grid-rows-[auto_auto_1fr] overflow-hidden rounded-dashboard-tile border border-on-primary/10 bg-on-primary/5',
        '@min-[580px]/dashboard:auto-cols-fr @min-[580px]/dashboard:grid-flow-col @min-[580px]/dashboard:grid-cols-none @min-[580px]/dashboard:gap-x-2.5 @min-[580px]/dashboard:overflow-visible @min-[580px]/dashboard:border-0 @min-[580px]/dashboard:bg-transparent',
        tiles.length === 3 && '@max-[580px]/dashboard:grid-rows-[auto_auto_auto_1fr]',
      )}
    >
      {tiles.map((tile, index) => (
        <OverviewTile key={tile.title} {...tile} compactPosition={positions?.[index]} />
      ))}
    </div>
  );
}

function activitySummary(orders?: number, chats?: number) {
  if (orders && chats) return 'Review orders and reply to customers who need your attention.';
  if (orders) return 'Review orders waiting to be confirmed or packed.';
  if (chats) return 'Reply to customers who need your attention.';
  return 'Review your shop’s activity and next steps.';
}

function countNewOrders({ ordersToConfirm, ordersToPack }: DashboardActivity) {
  if (ordersToConfirm === undefined || ordersToPack === undefined) return undefined;
  return ordersToConfirm + ordersToPack;
}

function overviewTiles({
  sales,
  period,
  store,
  newOrders,
  chatsWaiting,
}: {
  sales?: DashboardResponse['cards']['sales'];
  period: number;
  store: OverviewProps['store'];
  newOrders?: number;
  chatsWaiting?: number;
}) {
  return [
    sales && {
      title: `Sales in ${period} days`,
      value: formatWholeTaka(BigInt(sales.totalPoisha)),
      detail: <SalesChange sales={sales} period={period} />,
      href: store.canViewAnalytics ? '/analytics' : undefined,
    },
    store.canViewOrders && {
      title: 'New orders',
      value: displayCount(newOrders),
      count: newOrders,
      detail: newOrders === 0 ? 'All caught up' : 'To confirm or pack',
      href: '/orders',
    },
    store.canViewChats && {
      title: 'Chats waiting',
      value: displayCount(chatsWaiting),
      count: chatsWaiting,
      detail: waitingLabel(chatsWaiting),
      href: '/chats?tab=needs-you',
    },
  ];
}

function displayCount(value?: number) {
  return value === undefined ? '—' : formatCount(value);
}

function waitingLabel(value?: number) {
  if (value === undefined) return 'Waiting in Chats';
  return value > 0 ? 'Needs your attention' : 'None need you';
}

function OverviewTile({
  title,
  value,
  detail,
  href,
  count,
  compactPosition,
}: OverviewTileDetails & { compactPosition?: 'lead' | 'left' | 'right' | 'single' }) {
  const lead = compactPosition === 'lead';
  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-dashboard-label leading-tight font-semibold text-on-primary/70">
          {title}
        </span>
        {count ? (
          <span
            aria-hidden="true"
            className="hidden min-w-5.5 rounded-full bg-primary px-1.5 text-center text-xs font-bold text-on-primary @min-[600px]/dashboard:inline"
          >
            {formatCount(count)}
          </span>
        ) : null}
      </div>
      <span
        title={value}
        className={cn(
          'text-lg leading-none font-bold tracking-tight break-words tabular-nums @min-[580px]/dashboard:text-dashboard-value',
          lead &&
            '@max-[580px]/dashboard:col-start-2 @max-[580px]/dashboard:row-span-2 @max-[580px]/dashboard:row-start-1 @max-[580px]/dashboard:text-right @max-[580px]/dashboard:text-dashboard-value',
        )}
      >
        {value}
      </span>
      <span className="text-xs leading-tight font-semibold text-on-primary/70">{detail}</span>
    </>
  );
  const tileClass = cn(
    'row-span-3 grid min-w-0 grid-rows-subgrid gap-y-2 p-3.5 text-left @min-[580px]/dashboard:rounded-dashboard-tile @min-[580px]/dashboard:border @min-[580px]/dashboard:border-on-primary/8 @min-[580px]/dashboard:bg-on-primary/5 @min-[580px]/dashboard:p-4',
    lead &&
      '@max-[580px]/dashboard:col-span-2 @max-[580px]/dashboard:row-span-1 @max-[580px]/dashboard:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] @max-[580px]/dashboard:grid-rows-[auto_auto] @max-[580px]/dashboard:items-center @max-[580px]/dashboard:gap-x-3 @max-[580px]/dashboard:gap-y-1 @max-[580px]/dashboard:border-b @max-[580px]/dashboard:border-on-primary/10',
    compactPosition === 'right' &&
      '@max-[580px]/dashboard:border-l @max-[580px]/dashboard:border-on-primary/10',
    compactPosition === 'single' && '@max-[580px]/dashboard:col-span-2',
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        tileClass,
        'hover:bg-on-primary/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-primary',
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={tileClass}>{content}</div>
  );
}
