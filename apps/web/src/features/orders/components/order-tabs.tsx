import { useEffect, useRef, type ReactNode } from 'react';

import type { OrderTabCounts } from '@dakly/contracts/order-inquiries';
import { Skeleton } from '@dakly/ui/skeleton';
import { TabCount, Tabs, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { ordersSearch, usePrefetchOrders } from '../api/orders';
import { orderTabLabels, orderTabSequence } from '../order-labels';
import {
  currentOrderTab,
  orderTabQuery,
  type OrdersNavigationQuery,
  type OrderTab,
} from '../orders-url';
import { useUrlRouter } from '@/lib/use-url-query';

export const noTabValue = 'filtered';

type OrderTabsProps = {
  query: OrdersNavigationQuery;
  counts?: OrderTabCounts;
  children: ReactNode;
};

// The tab is in the address, so a link opens the same list. Arrow keys move between tabs and
// Enter opens one, which keeps a quick pass over eight tabs from loading eight lists.
export function OrderTabs({ query, counts, children }: OrderTabsProps) {
  const router = useUrlRouter();
  const prefetch = usePrefetchOrders();
  const list = useRef<HTMLDivElement>(null);
  const current = currentOrderTab(query);

  useEffect(() => {
    list.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [current]);

  function warm(tab: OrderTab) {
    if (tab === 'inquiries') return;
    prefetch(orderTabQuery(tab, query));
  }

  return (
    <Tabs
      value={current ?? noTabValue}
      activationMode="manual"
      onValueChange={(tab) => {
        const chosen = orderTabSequence.find((each) => each === tab);
        if (!chosen) return;
        const { labelOrderIds } = query;
        router.push(`/orders?${ordersSearch({ ...orderTabQuery(chosen, query), labelOrderIds })}`);
      }}
    >
      <TabsList ref={list} aria-label="Order stages" className="gap-1 [scrollbar-width:none]">
        {orderTabSequence.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="min-h-11 px-3 text-sm font-medium data-[state=active]:font-semibold"
            onPointerEnter={() => warm(tab)}
            onFocus={() => warm(tab)}
          >
            {orderTabLabels[tab]}
            {counts ? (
              <TabCount className="group-data-[state=active]:bg-action group-data-[state=active]:text-on-primary">
                {counts[tab]}
              </TabCount>
            ) : (
              <Skeleton className="h-[18px] w-5 rounded-full" />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
