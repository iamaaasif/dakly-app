import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import type { OrderReportingService } from '../orders/order-reporting.service';
import { atLeastOrAtMost } from './automation-step-rules';

// What the customer has spent and ordered is read from orders when the event arrives, so the order
// that started the workflow already counts.
export async function holdsCustomerTotals(
  orders: Pick<OrderReportingService, 'buyerTotals'>,
  storeId: string,
  contactId: string,
  filters: AutomationGraph['trigger']['filters'],
) {
  const spend = filters.find((filter) => filter.field === 'customer_spend');
  const count = filters.find((filter) => filter.field === 'customer_orders');
  if (!spend && !count) return true;
  const totals = await orders.buyerTotals(storeId, contactId);
  return (
    (!spend || atLeastOrAtMost(spend, totals.netSpendPoisha, spend.amountPoisha)) &&
    (!count || atLeastOrAtMost(count, totals.ordersCount, count.count))
  );
}
