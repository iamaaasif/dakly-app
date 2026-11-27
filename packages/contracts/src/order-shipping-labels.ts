import { z } from 'zod';

import type { OrderDetail } from './orders';

export const maxOrderShippingLabels = 100;
export const shippingLabelsPhoneRequired = 'You need full phone access to print labels';

export const shippingLabelOrderIdsSchema = z
  .string()
  .transform((value) => value.toLowerCase().split(','))
  .pipe(z.array(z.uuid()).min(1).max(maxOrderShippingLabels))
  .transform((ids) => [...new Set(ids)]);

export const shippingLabelQuerySchema = z.strictObject({ orderIds: shippingLabelOrderIdsSchema });

export type OrderShippingLabel = Pick<
  OrderDetail,
  'id' | 'number' | 'recipientName' | 'recipientPhone' | 'recipientAddress' | 'recipientDistrict'
> & { itemCount: number; codDuePoisha: number };

export type OrderShippingLabels = {
  store: { name: string; phone: string | null };
  labels: OrderShippingLabel[];
};
