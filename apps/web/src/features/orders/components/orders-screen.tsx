'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type RefObject } from 'react';

import { orderTabs, type OrderListQuery, type OrderStage } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';

import { ordersSearch, useOrders } from '../api/orders';
import { orderStageLabels } from '../order-labels';
import { OrderAlerts } from './order-alerts';
import { OrderDetailSheet } from './order-detail-sheet';
import { NewOrderDialog } from './order-editor-dialog';
import { OrderFilters } from './order-filters';
import { OrderSearch } from './order-search';
import { OrdersList } from './orders-list';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';

type OrdersScreenProps = { query: OrderListQuery; selected?: string };

export function OrdersScreen({ query, selected }: OrdersScreenProps) {
  const orders = useOrders(query);
  const pendingListRefresh = orders.fetchStatus !== 'idle';
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const listHref = `/orders?${ordersSearch(query)}`;

  return (
    <StorePage permission="canViewOrders">
      <main className="mx-auto max-w-7xl space-y-4 p-6 md:p-8">
        <OrdersHeader
          heading={heading}
          onSaved={(id) => router.replace(`/orders?${ordersSearch({ ...query, selected: id })}`)}
        />
        {orders.data ? <OrderAlerts alerts={orders.data.alerts} /> : null}
        <OrderStageNav query={query} counts={orders.data?.counts} />
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
        <p className="text-xs text-text-muted">
          Return risk is based on your past orders. Courier names are demo integrations in this
          prototype.
        </p>
        {selected ? (
          <OrderDetailSheet
            key={selected}
            id={selected}
            restoreFocusTo={() =>
              orderRowFocus(heading.current, pendingListRefresh ? undefined : selected)
            }
            onClose={() => router.replace(listHref)}
          />
        ) : null}
      </main>
    </StorePage>
  );
}

type OrdersHeaderProps = {
  heading: RefObject<HTMLHeadingElement | null>;
  onSaved: (id: string) => void;
};

function OrdersHeader({ heading, onSaved }: OrdersHeaderProps) {
  const { data } = useSessionContext();
  const [open, setOpen] = useState(false);
  const canCreate = data?.currentStore?.canEditOrders;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Orders
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Every order from Messenger, Instagram, WhatsApp and calls — from first question to money
          in hand.
        </p>
      </div>
      {canCreate && (
        <Button className="min-h-11 sm:min-h-10" onClick={() => setOpen(true)}>
          <span aria-hidden="true">+ </span>New order
        </Button>
      )}
      {open && (
        <NewOrderDialog
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false);
            onSaved(id);
          }}
        />
      )}
    </header>
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

type OrderStageNavProps = {
  query: OrderListQuery;
  counts?: Record<OrderStage, number>;
};

function OrderStageNav({ query, counts }: OrderStageNavProps) {
  return (
    <nav aria-label="Order stages" className="flex flex-wrap border-b border-border">
      {orderTabs.map((stage) => {
        const isCurrent = stage === query.stage;
        return (
          <Link
            key={stage}
            href={`/orders?${ordersSearch({ ...query, stage, alert: undefined, cursor: undefined })}`}
            aria-current={isCurrent ? 'page' : undefined}
            className="flex min-h-11 shrink-0 items-center gap-1 border-b-2 border-transparent px-2 text-sm whitespace-nowrap hover:bg-surface-muted aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-text sm:min-h-12 sm:gap-2 sm:px-3 sm:text-base"
          >
            {orderStageLabels[stage]}
            {counts ? (
              <span
                className={cn(
                  'ml-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                  isCurrent
                    ? 'bg-primary font-semibold text-on-primary'
                    : 'bg-surface-muted text-text-muted',
                )}
              >
                {counts[stage]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
