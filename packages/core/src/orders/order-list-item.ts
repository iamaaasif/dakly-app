import type { OrderListItem } from '@dakly/contracts/orders';

import { orderRiskFields } from './order-risk';
import { orderTotalPoisha } from './order-totals';
import type { OrdersRepository } from './orders.repository';

type OrderRow = Awaited<ReturnType<OrdersRepository['list']>>[number];
type ParcelOutcome = Parameters<typeof orderRiskFields>[0];

export function toOrderListItem(
  { recipientPhone: _recipientPhone, createdAt, returnedAt, ...row }: OrderRow,
  outcome: ParcelOutcome,
  overdueBefore: Date,
): OrderListItem {
  return {
    ...row,
    createdAt: createdAt.toISOString(),
    returnedAt: returnedAt?.toISOString() ?? null,
    totalPoisha: orderTotalPoisha(row),
    ...orderRiskFields(outcome),
    isWaitingForConfirmation: row.stage === 'to_confirm' && createdAt < overdueBefore,
  };
}
