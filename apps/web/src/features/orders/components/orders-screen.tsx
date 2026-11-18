'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import { orderTabs, type OrderListQuery } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { QueryError } from '@dakly/ui/query-error';

import { ordersSearch, useOrders } from '../api/orders';
import { orderStageLabels } from '../order-labels';
import { OrderAlerts } from './order-alerts';
import { OrderDetailSheet } from './order-detail-sheet';
import { OrderFilters } from './order-filters';
import { OrderSearch } from './order-search';
import { OrdersList } from './orders-list';
import { StorePage } from '@/components/store-page';

type OrdersScreenProps = { query: OrderListQuery; selected?: string };

export function OrdersScreen({ query, selected }: OrdersScreenProps) {
  const orders = useOrders(query);
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const listHref = `/orders?${ordersSearch(query)}`;

  return (
    <StorePage permission="canViewOrders">
      <main className="mx-auto max-w-7xl space-y-4 p-6 md:p-8">
        <header>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Orders
          </h1>
          <p className="mt-1 text-text-muted">Follow each order from confirmation to delivery.</p>
        </header>
        {orders.data ? <OrderAlerts alerts={orders.data.alerts} /> : null}
        <nav aria-label="Order stages" className="flex flex-wrap border-b border-border">
          {orderTabs.map((stage) => (
            <Link
              key={stage}
              href={`/orders?${ordersSearch({ ...query, stage, alert: undefined, cursor: undefined })}`}
              aria-current={stage === query.stage ? 'page' : undefined}
              className="flex min-h-10 shrink-0 items-center gap-1 border-b-2 border-transparent px-2 text-sm whitespace-nowrap hover:bg-surface-muted aria-[current=page]:border-action aria-[current=page]:font-semibold sm:min-h-12 sm:gap-2 sm:px-3 sm:text-base"
            >
              {orderStageLabels[stage]}
              {orders.data ? (
                <Badge className="tabular-nums">{orders.data.counts[stage]}</Badge>
              ) : null}
            </Link>
          ))}
        </nav>
        <OrderSearch query={query} />
        <OrderFilters query={query} />
        {orders.isPending ? <p role="status">Loading orders…</p> : null}
        {orders.error ? (
          <QueryError
            message={orders.error.message}
            onRetry={() => void orders.refetch()}
            retryLabel="Retry orders"
          />
        ) : null}
        {orders.data ? <OrdersList page={orders.data} query={query} /> : null}
        {selected ? (
          <OrderDetailSheet
            key={selected}
            id={selected}
            restoreFocusTo={() =>
              orderRowFocus(heading.current, orders.fetchStatus === 'idle' ? selected : undefined)
            }
            onClose={() => router.replace(listHref)}
          />
        ) : null}
      </main>
    </StorePage>
  );
}

function orderRowFocus(heading: HTMLHeadingElement | null, orderId: string | undefined) {
  if (!orderId) return heading;
  return (
    heading
      ?.closest('main')
      ?.querySelector<HTMLAnchorElement>(`[data-order-row-action="${orderId}"]`) ?? heading
  );
}
