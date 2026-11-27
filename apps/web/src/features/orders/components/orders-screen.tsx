'use client';

import { useRef, useState, type RefObject } from 'react';

import {
  orderTabs,
  type OrderAlerts as Alerts,
  type OrderListQuery,
  type OrderStage,
} from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { ordersSearch, useOrders } from '../api/orders';
import { orderStageLabels } from '../order-labels';
import { parseOrdersScreen, type OrdersNavigationQuery } from '../orders-url';
import { OrderAlerts } from './order-alerts';
import { OrderDetailSheet } from './order-detail-sheet';
import { NewOrderDialog } from './order-editor-dialog';
import { OrderExportMenu } from './order-export-menu';
import { OrdersResults } from './orders-results';
import { StorePage } from '@/components/store-page';
import { UrlLink } from '@/components/url-link';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

type OrdersScreenProps = { query: OrderListQuery; selected?: string; labelOrderIds?: string[] };

export function OrdersScreen(initial: OrdersScreenProps) {
  const { query, selected, labelOrderIds = [] } = useUrlQuery(initial, parseOrdersScreen);
  const orders = useOrders(query);
  const alerts = useRememberedAlerts(orders.data?.alerts);
  const router = useUrlRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const navigationQuery = { ...query, labelOrderIds };
  const pendingListRefresh = orders.fetchStatus !== 'idle';

  return (
    <StorePage permission="canViewOrders">
      <main className="space-y-4 p-4 md:p-8">
        <OrdersHeader
          heading={heading}
          query={query}
          onSaved={(id) =>
            router.replace(`/orders?${ordersSearch({ ...navigationQuery, selected: id })}`)
          }
        />
        {alerts ? <OrderAlerts alerts={alerts} labelOrderIds={labelOrderIds} /> : null}
        <OrderStageNav query={navigationQuery} counts={orders.data?.counts} />
        <OrdersResults
          query={navigationQuery}
          orders={orders}
          counts={orders.data?.counts}
          selected={selected}
        />
        <p className="text-xs text-text-muted">Return risk is based on your past orders.</p>
        {selected ? (
          <OrderDetailSheet
            key={selected}
            id={selected}
            restoreFocusTo={() =>
              orderRowFocus(heading.current, pendingListRefresh ? undefined : selected)
            }
            onClose={() => router.replace(`/orders?${ordersSearch(navigationQuery)}`)}
          />
        ) : null}
      </main>
    </StorePage>
  );
}

// The alerts come with each list, so another tab's loading list must not make the row blink away.
function useRememberedAlerts(latest: Alerts | undefined) {
  const [alerts, setAlerts] = useState(latest);
  if (latest && latest !== alerts) setAlerts(latest);
  return alerts;
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
          className="text-page font-bold tracking-tight text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
