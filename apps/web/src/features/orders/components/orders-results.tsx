import { maxOrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import type { OrderStage } from '@dakly/contracts/orders';
import { TableCard } from '@dakly/ui/table';

import { ordersSearch, type useOrders } from '../api/orders';
import type { OrdersNavigationQuery } from '../orders-url';
import { OrderLabelSelection } from './order-label-selection';
import { OrdersList } from './orders-list';
import { OrdersToolbar } from './orders-toolbar';
import { useUrlRouter } from '@/lib/use-url-query';

type OrdersResultsProps = {
  query: OrdersNavigationQuery;
  orders: ReturnType<typeof useOrders>;
  counts?: Record<OrderStage, number>;
  selected?: string;
};

// The shipping label bar, then one card with the toolbar and the rows.
export function OrdersResults({ query, orders, counts, selected }: OrdersResultsProps) {
  const router = useUrlRouter();
  const selectedIds = query.labelOrderIds ?? [];

  function changeLabelSelection(ids: string[]) {
    router.replace(`/orders?${ordersSearch({ ...query, selected, labelOrderIds: ids })}`);
  }
  function toggleLabel(id: string) {
    if (selectedIds.includes(id)) changeLabelSelection(selectedIds.filter((each) => each !== id));
    else if (selectedIds.length < maxOrderShippingLabels)
      changeLabelSelection([...selectedIds, id]);
  }

  return (
    <div className="space-y-3">
      <OrderLabelSelection orderIds={selectedIds} onClear={() => changeLabelSelection([])} />
      {/* A new stage or filter starts its own page trail, so the list is keyed by them. */}
      <TableCard>
        <OrdersToolbar query={query} />
        <OrdersList
          key={cardKey(query)}
          orders={orders}
          query={query}
          total={query.stage ? counts?.[query.stage] : undefined}
          onToggleLabel={toggleLabel}
        />
      </TableCard>
    </div>
  );
}

function cardKey({ stage, alert, source, courier, search }: OrdersNavigationQuery) {
  return [stage, alert, source, courier, search].join('|');
}
