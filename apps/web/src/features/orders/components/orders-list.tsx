import { maxOrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import type { OrderListItem } from '@dakly/contracts/orders';
import { QueryError } from '@dakly/ui/query-error';

import { ordersSearch, type useOrders } from '../api/orders';
import { orderTabLabels } from '../order-labels';
import {
  currentOrderTab,
  isNarrowedOrderList,
  orderTabQuery,
  type OrdersNavigationQuery,
} from '../orders-url';
import { usePageTrail } from '../use-page-trail';
import { OrderRow } from './order-row';
import { OrdersEmpty } from './orders-empty';
import { OrdersLoading } from './orders-loading';
import { OrdersPager } from './orders-pager';
import { Refreshing } from '@/components/refreshing';
import { useSessionContext } from '@/lib/session-context';
import { useUrlRouter } from '@/lib/use-url-query';

type OrdersListProps = {
  orders: ReturnType<typeof useOrders>;
  query: OrdersNavigationQuery;
  // The tab's total, shown when nothing narrows the list.
  total?: number;
  onToggleLabel: (id: string) => void;
};

export function OrdersList({ orders, query, total, onToggleLabel }: OrdersListProps) {
  const router = useUrlRouter();
  const trail = usePageTrail(query.cursor, (cursor) =>
    router.push(`/orders?${ordersSearch({ ...query, cursor })}`),
  );
  const tab = currentOrderTab(query);
  const label = tab ? orderTabLabels[tab].toLowerCase() : 'orders';
  if (orders.isPending) return <OrdersLoading label={label} />;
  if (orders.error)
    return (
      <QueryError
        message={orders.error.message}
        onRetry={() => void orders.refetch()}
        retryLabel="Retry orders"
      />
    );
  const { items, nextCursor } = orders.data;
  const narrowed = isNarrowedOrderList(query);
  return (
    <Refreshing active={orders.isPlaceholderData}>
      {items.length === 0 ? (
        <NoOrders label={label} query={query} narrowed={narrowed} />
      ) : (
        <OrderItems items={items} query={query} onToggleLabel={onToggleLabel} />
      )}
      <OrdersPager
        shown={items.length}
        total={narrowed ? undefined : total}
        trail={trail}
        nextCursor={nextCursor}
      />
    </Refreshing>
  );
}

type NoOrdersProps = { label: string; query: OrdersNavigationQuery; narrowed: boolean };

function NoOrders({ label, query, narrowed }: NoOrdersProps) {
  const tab = currentOrderTab(query);
  const first = tab ? orderTabQuery(tab, { limit: query.limit }) : {};
  const clearHref = `/orders?${ordersSearch({ ...first, labelOrderIds: query.labelOrderIds })}`;
  return narrowed ? (
    <OrdersEmpty
      title="No orders match"
      hint="Try a different name, order number or filter."
      clearHref={clearHref}
    />
  ) : (
    <OrdersEmpty
      title={`No orders in ${label}`}
      hint="Orders show here as soon as they reach this step."
    />
  );
}

type OrderItemsProps = {
  items: OrderListItem[];
  query: OrdersNavigationQuery;
  onToggleLabel: (id: string) => void;
};

function OrderItems({ items, query, onToggleLabel }: OrderItemsProps) {
  const store = useSessionContext().data?.currentStore;
  const selectedIds = new Set(query.labelOrderIds);
  const atLimit = selectedIds.size >= maxOrderShippingLabels;
  return (
    <ul aria-label="Orders" className="divide-y divide-border">
      {items.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          href={`/orders?${ordersSearch({ ...query, selected: order.id })}`}
          canEdit={store?.canEditOrders ?? false}
          selection={
            store?.canPrintShippingLabels
              ? {
                  checked: selectedIds.has(order.id),
                  disabled: atLimit && !selectedIds.has(order.id),
                  onToggle: () => onToggleLabel(order.id),
                }
              : undefined
          }
        />
      ))}
    </ul>
  );
}
