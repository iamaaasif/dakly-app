import { z } from 'zod';

import { shippingLabelOrderIdsSchema } from '@dakly/contracts/order-shipping-labels';
import {
  orderScreenQuerySchema,
  orderTabs,
  type OrderListQuery,
  type OrderStage,
} from '@dakly/contracts/orders';

// Inquiries are chats, not orders, so that tab has its own address value. Pending is the orders
// waiting for an advance, which the list already filters by payment status.
export type OrderTab = 'inquiries' | 'pending' | Extract<OrderStage, (typeof orderTabs)[number]>;
export type OrdersNavigationQuery = OrderListQuery & {
  labelOrderIds?: string[];
  tab?: 'inquiries';
};

type RawQuery = Record<string, string | string[] | undefined>;

const ordersNavigationSchema = orderScreenQuerySchema.safeExtend({
  labelOrderIds: shippingLabelOrderIdsSchema.optional(),
  tab: z.literal('inquiries').optional(),
});

export function parseOrdersScreen(raw: RawQuery) {
  const parsed = ordersNavigationSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { selected, labelOrderIds, tab, ...query } = parsed.data;
  const chosen = Boolean(query.alert || tab || query.paymentStatus);
  return {
    query: { ...query, stage: query.stage ?? (chosen ? undefined : ('to_confirm' as const)) },
    selected,
    labelOrderIds,
    tab,
  };
}

// No tab is current for the alert views and the cancelled orders filter.
export function currentOrderTab(query: OrdersNavigationQuery): OrderTab | undefined {
  if (query.tab) return query.tab;
  if (query.stage) return orderTabs.find((tab) => tab === query.stage);
  return query.paymentStatus === 'advance_requested' ? 'pending' : undefined;
}

// A tab keeps the search and filters but starts at its first page.
export function orderTabQuery(
  tab: OrderTab,
  query: OrderListQuery,
): OrderListQuery & { tab?: 'inquiries' } {
  const { search, courier, createdFrom, createdThrough, limit } = query;
  if (tab === 'inquiries') return { search, limit, tab };
  const kept = { search, limit, source: query.source, courier, createdFrom, createdThrough };
  if (tab === 'pending') return { ...kept, paymentStatus: 'advance_requested' };
  return { ...kept, stage: tab };
}

// Search or a filter narrows the list, so the tab's total no longer describes it.
export function isNarrowedOrderList(query: OrderListQuery): boolean {
  const { search, source, courier, createdFrom, createdThrough } = query;
  return Boolean(search || source || courier || createdFrom || createdThrough);
}
