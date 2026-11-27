'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type RefObject } from 'react';

import type { OrderAlerts, OrderListQuery } from '@dakly/contracts/orders';
import { buttonVariants } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useOrderTabCounts } from '../api/order-tabs';
import { ordersSearch, useOrders } from '../api/orders';
import { parseOrdersScreen } from '../orders-url';
import { OrderAlertStrip } from './order-alert-strip';
import { OrderDetailSheet } from './order-detail-sheet';
import { OrderExportMenu } from './order-export-menu';
import { OrderTabs } from './order-tabs';
import { OrdersResults } from './orders-results';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

type OrdersScreenProps = {
  query: OrderListQuery;
  selected?: string;
  labelOrderIds?: string[];
  tab?: 'inquiries';
};

export function OrdersScreen(initial: OrdersScreenProps) {
  const { query, selected, labelOrderIds = [], tab } = useUrlQuery(initial, parseOrdersScreen);
  // Inquiries are chats. The order list still runs, one row deep, because the alerts ride on it.
  const orders = useOrders(tab === 'inquiries' ? { limit: 1 } : query);
  const alerts = useRememberedAlerts(orders.data?.alerts);
  const counts = useOrderTabCounts().data;
  const router = useUrlRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const navigationQuery = { ...query, labelOrderIds, tab };
  const pendingListRefresh = orders.fetchStatus !== 'idle';

  return (
    <StorePage permission="canViewOrders">
      <main className="space-y-4 p-4 md:p-8">
        <OrdersHeader heading={heading} query={query} />
        <OrderAlertStrip alerts={alerts} query={navigationQuery} />
        <OrderTabs query={navigationQuery} counts={counts}>
          <OrdersResults
            query={navigationQuery}
            orders={orders}
            counts={counts}
            selected={selected}
          />
        </OrderTabs>
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
function useRememberedAlerts(latest: OrderAlerts | undefined) {
  const [alerts, setAlerts] = useState(latest);
  if (latest && latest !== alerts) setAlerts(latest);
  return alerts;
}

type OrdersHeaderProps = {
  heading: RefObject<HTMLHeadingElement | null>;
  query: OrderListQuery;
};

function OrdersHeader({ heading, query }: OrdersHeaderProps) {
  const { data } = useSessionContext();
  const router = useRouter();
  const store = data?.currentStore;
  const canCreate = store?.canEditOrders;
  // n opens a new order, as on Products and Contacts. It never fires while typing in a field.
  useEffect(() => {
    if (!canCreate) return;
    const open = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key !== 'n' || event.ctrlKey || event.metaKey || event.altKey || typing) return;
      event.preventDefault();
      router.push('/orders/new');
    };
    window.addEventListener('keydown', open);
    return () => window.removeEventListener('keydown', open);
  }, [canCreate, router]);
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
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
          <Link href="/orders/new" className={cn(buttonVariants(), 'min-h-11 sm:min-h-10')}>
            <span aria-hidden="true">+ </span>New order
          </Link>
        ) : null}
      </div>
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
