import { and, eq, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import type { OrderListQuery, OrderStage } from '@dakly/contracts/orders';
import { orders } from '@dakly/db/schema/orders';

import type { Transaction } from '../platform/database/scoped-transactions';

export type OrderMatch = Omit<OrderListQuery, 'stage' | 'cursor' | 'limit'> & {
  stages?: OrderStage[];
  timeZone: string | null;
  phone?: string;
  overdueBefore: Date;
};

export function orderMatchingConditions(tx: Transaction, storeId: string, filter: OrderMatch) {
  return and(
    eq(orders.storeId, storeId),
    filter.stages ? inArray(orders.stage, filter.stages) : undefined,
    orderSearch(filter.search, filter.phone),
    orderFilters(filter),
    filter.alert ? orderAlertFilter(tx, storeId, filter.alert, filter.overdueBefore) : undefined,
  );
}

export const parcelOutcome = sql`${orders.stage} in ('delivered', 'partially_delivered', 'returned')`;

function orderFilters({
  source,
  courier,
  buyerContactId,
  createdFrom,
  createdThrough,
  timeZone,
}: OrderMatch) {
  return and(
    buyerContactId ? eq(orders.buyerContactId, buyerContactId) : undefined,
    source ? eq(orders.source, source) : undefined,
    courier ? eq(orders.courier, courier) : undefined,
    createdFrom
      ? sql`${orders.createdAt} >= ${createdFrom}::date::timestamp at time zone ${timeZone}`
      : undefined,
    createdThrough
      ? sql`${orders.createdAt} < (${createdThrough}::date + 1)::timestamp at time zone ${timeZone}`
      : undefined,
  );
}

function orderSearch(search?: string, phone?: string) {
  if (!search) return;
  if (phone) return eq(orders.recipientPhone, phone);
  if (/^#?\d{1,10}$/.test(search)) {
    const number = Number(search.replace('#', ''));
    if (number <= 2147483647) return eq(orders.number, number);
  }
  const name = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
  return or(ilike(orders.buyerName, name), ilike(orders.recipientName, name));
}

export function orderAlertFilter(
  tx: Transaction,
  storeId: string,
  alert: NonNullable<OrderListQuery['alert']>,
  overdueBefore: Date,
): SQL {
  if (alert === 'waiting')
    return sql`${orders.stage} = 'to_confirm' and ${lt(orders.createdAt, overdueBefore)}`;
  if (alert === 'cod')
    return sql`${orders.stage} in ('delivered', 'partially_delivered')
      and ${orders.paymentStatus} in ('cod_pending', 'advance_paid') and ${orders.codAmountPoisha} > 0`;
  const riskPhones = tx
    .select({ phone: orders.recipientPhone })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), parcelOutcome))
    .groupBy(orders.recipientPhone)
    .having(
      sql`count(*) >= 2 and 2 * count(*) filter (where ${orders.stage} = 'returned') >= count(*)`,
    );
  return sql`${orders.stage} = 'to_confirm' and ${orders.advancePaidPoisha} = 0
    and ${inArray(orders.recipientPhone, riskPhones)}`;
}
