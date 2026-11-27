'use client';

import { useRef, useState, type RefObject } from 'react';

import { maxOrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import { orderTabs, type OrderListQuery, type OrderStage } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';

import { ordersSearch, useOrders } from '../api/orders';
import { orderStageLabels } from '../order-labels';
import { parseOrdersScreen, type OrdersNavigationQuery } from '../orders-url';
import { OrderAlerts } from './order-alerts';
import { OrderDetailSheet } from './order-detail-sheet';
import { NewOrderDialog } from './order-editor-dialog';
import { OrderExportMenu } from './order-export-menu';
import { OrderFilters } from './order-filters';
import { OrderLabelSelection } from './order-label-selection';
import { OrdersList } from './orders-list';
import { Refreshing } from '@/components/refreshing';
import { StorePage } from '@/components/store-page';
import { UrlLink } from '@/components/url-link';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

type OrdersScreenProps = { query: OrderListQuery; selected?: string; labelOrderIds?: string[] };

export function OrdersScreen(initial: OrdersScreenProps) {
  const { query, selected, labelOrderIds = [] } = useUrlQuery(initial, parseOrdersScreen);
  const orders = useOrders(query);
  const router = useUrlRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const navigationQuery = { ...query, labelOrderIds };
  const listHref = `/orders?${ordersSearch(navigationQuery)}`;

  function changeLabelSelection(ids: string[]) {
    router.replace(`/orders?${ordersSearch({ ...query, selected, labelOrderIds: ids })}`);
  }

  function toggleLabel(id: string) {
    if (labelOrderIds.includes(id))
      changeLabelSelection(labelOrderIds.filter((value) => value !== id));
    else if (labelOrderIds.length < maxOrderShippingLabels)
      changeLabelSelection([...labelOrderIds, id]);
  }

  return (
    <StorePage permission="canViewOrders">
      <main className="mx-auto max-w-7xl space-y-4 p-6 md:p-8">
        <OrdersHeader
          heading={heading}
          query={query}
          onSaved={(id) =>
            router.replace(`/orders?${ordersSearch({ ...navigationQuery, selected: id })}`)
          }
        />
        {orders.data ? (
          <OrderAlerts alerts={orders.data.alerts} labelOrderIds={labelOrderIds} />
        ) : null}
        <OrderStageNav query={navigationQuery} counts={orders.data?.counts} />
        <OrderFilters query={navigationQuery} />
        <OrderLabelSelection orderIds={labelOrderIds} onClear={() => changeLabelSelection([])} />
        {orders.isPending ? <p role="status">Loading orders…</p> : null}
        {orders.error ? (
          <QueryError
            message={orders.error.message}
            onRetry={() => void orders.refetch()}
            retryLabel="Retry orders"
          />
        ) : null}
        {orders.data ? (
          <Refreshing active={orders.isPlaceholderData}>
            <OrdersList page={orders.data} query={navigationQuery} onToggleLabel={toggleLabel} />
          </Refreshing>
        ) : null}
        <p className="text-xs text-text-muted">Return risk is based on your past orders.</p>
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

type OrdersHeaderProps = {
  heading: RefObject<HTMLHeadingElement | null>;
  query: OrderListQuery;
  onSaved: (id: string) => void;
};

function OrdersHeader({ heading, query, onSaved }: OrdersHeaderProps) {
  const { data } = useSessionContext();
  const [open, setOpen] = useState(false);
  const store = data?.currentStore;
  const canCreate = store?.canEditOrders;
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
      <div className="flex flex-wrap items-start gap-2">
        {store?.canExportOrders ? <OrderExportMenu query={query} /> : null}
        {canCreate ? (
          <Button className="min-h-11 sm:min-h-10" onClick={() => setOpen(true)}>
            <span aria-hidden="true">+ </span>New order
          </Button>
        ) : null}
      </div>
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
  query: OrdersNavigationQuery;
  counts?: Record<OrderStage, number>;
};

function OrderStageNav({ query, counts }: OrderStageNavProps) {
  return (
    <nav
      aria-label="Order stages"
      className="flex overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {orderTabs.map((stage) => {
        const isCurrent = stage === query.stage;
        return (
          <UrlLink
            key={stage}
            href={`/orders?${ordersSearch({ ...query, stage, alert: undefined, cursor: undefined })}`}
            aria-current={isCurrent ? 'page' : undefined}
            className="flex min-h-11 shrink-0 items-center gap-1 border-b-2 border-transparent px-2 text-sm whitespace-nowrap hover:bg-surface-muted aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-text sm:min-h-12 sm:gap-2 sm:px-3 sm:text-base"
          >
            {orderStageLabels[stage]}
            {counts ? (
              <Badge
                variant="neutral"
                className={cn(
                  'ml-1 rounded-full px-2 py-0.5 text-xs tabular-nums',
                  isCurrent && 'bg-primary font-semibold text-on-primary',
                )}
              >
                {counts[stage]}
              </Badge>
            ) : null}
          </UrlLink>
        );
      })}
    </nav>
  );
}
