import type { OrderTabCounts } from '@dakly/contracts/order-inquiries';
import { maxOrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import { TableCard } from '@dakly/ui/table';
import { TabsContent } from '@dakly/ui/tabs';

import { ordersSearch, type useOrders } from '../api/orders';
import { currentOrderTab, type OrdersNavigationQuery } from '../orders-url';
import { OrderInquiries } from './order-inquiries';
import { OrderLabelSelection } from './order-label-selection';
import { noTabValue } from './order-tabs';
import { OrdersList } from './orders-list';
import { OrdersToolbar } from './orders-toolbar';
import { useUrlRouter } from '@/lib/use-url-query';

type OrdersResultsProps = {
  query: OrdersNavigationQuery;
  orders: ReturnType<typeof useOrders>;
  counts?: OrderTabCounts;
  selected?: string;
};

// The panel of the current tab: the shipping label bar, then one card with the toolbar and rows.
export function OrdersResults({ query, orders, counts, selected }: OrdersResultsProps) {
  const router = useUrlRouter();
  const current = currentOrderTab(query);
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
    <TabsContent value={current ?? noTabValue} className="space-y-3 pt-3">
      <OrderLabelSelection orderIds={selectedIds} onClear={() => changeLabelSelection([])} />
      {/* A new tab or filter starts its own page trail, so the card is keyed by them. */}
      <TableCard key={cardKey(query)}>
        <OrdersToolbar query={query} />
        {query.tab === 'inquiries' ? (
          <OrderInquiries query={query} total={counts?.inquiries} />
        ) : (
          <OrdersList
            orders={orders}
            query={query}
            total={current ? counts?.[current] : undefined}
            onToggleLabel={toggleLabel}
          />
        )}
      </TableCard>
    </TabsContent>
  );
}

function cardKey({
  stage,
  paymentStatus,
  alert,
  tab,
  source,
  courier,
  search,
}: OrdersNavigationQuery) {
  return [stage, paymentStatus, alert, tab, source, courier, search].join('|');
}
