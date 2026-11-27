import { shippingLabelOrderIdsSchema } from '@dakly/contracts/order-shipping-labels';
import { orderScreenQuerySchema, type OrderListQuery } from '@dakly/contracts/orders';

export type OrdersNavigationQuery = OrderListQuery & { labelOrderIds?: string[] };

type RawQuery = Record<string, string | string[] | undefined>;

const ordersNavigationSchema = orderScreenQuerySchema.safeExtend({
  labelOrderIds: shippingLabelOrderIdsSchema.optional(),
});

export function parseOrdersScreen(raw: RawQuery) {
  const parsed = ordersNavigationSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { selected, labelOrderIds, ...query } = parsed.data;
  return {
    query: { ...query, stage: query.stage ?? (query.alert ? undefined : ('to_confirm' as const)) },
    selected,
    labelOrderIds,
  };
}
