import { z } from 'zod';

import { bdMobileSchema } from './phone';

export const orderSources = [
  'messenger',
  'instagram',
  'whatsapp',
  'comment',
  'order_link',
  'manual',
  'pos_csv',
  'shopify',
  'woocommerce',
] as const;
// Fulfilment and money are separate fields. Allowed moves are in orders/order-stage.ts.
export const orderStages = [
  'to_confirm',
  'on_hold',
  'to_pack',
  'with_courier',
  'delivered',
  'partially_delivered',
  'returned',
  'cancelled',
] as const;
export const orderPaymentStatuses = [
  'cod_pending',
  'advance_requested',
  'advance_paid',
  'paid',
  'cod_collected',
  'refund_due',
  'refunded',
] as const;
// Recorded for the timeline and reports. None of them proves who owns a phone (D26).
export const orderConfirmationMethods = [
  'whatsapp_reply',
  'sms_link',
  'chat_reply',
  'staff',
  'advance_paid',
] as const;
export const onHoldReasons = [
  'pre_order',
  'cannot_reach',
  'waiting_for_advance',
  'customer_asked_to_wait',
  'other',
] as const;
export const cancelReasons = [
  'not_confirmed',
  'out_of_stock',
  'duplicate',
  'fake',
  'test',
  'wrong_order',
  'customer_cancelled',
  'other',
] as const;
export const couriers = ['steadfast', 'pathao', 'redx', 'own_delivery', 'other'] as const;
export const orderCreatorTypes = ['ai', 'user', 'customer', 'sync'] as const;
export const attributionSourceTypes = ['campaign', 'automation', 'post'] as const;
export const bdAreaKinds = ['division', 'district', 'upazila'] as const;
// A shop's own discount code, given in a campaign offer, a workflow step or by hand.
export const discountCodeKinds = ['percent', 'amount', 'free_delivery'] as const;
export const discountCodeSourceTypes = ['manual', 'campaign', 'automation'] as const;

export type OrderStage = (typeof orderStages)[number];

export const orderListQuerySchema = z.strictObject({
  stage: z.enum(orderStages).optional(),
  cursor: z.coerce.number<string>().int().positive().max(2147483647).optional(),
  limit: z.coerce.number<string>().int().min(1).max(100).default(50),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export type OrderSummary = {
  id: string;
  number: number;
  buyerName: string | null;
  recipientName: string;
  stage: OrderStage;
  source: (typeof orderSources)[number];
  paymentStatus: (typeof orderPaymentStatuses)[number];
  itemsSubtotalPoisha: number;
  orderDiscountPoisha: number;
  deliveryChargePoisha: number;
  advancePaidPoisha: number;
  codAmountPoisha: number;
  createdAt: string;
};

export type OrderListResponse = {
  items: OrderSummary[];
  counts: Record<OrderStage, number>;
  nextCursor: number | null;
};

export type OrderItem = {
  id: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  deliveredQuantity: number | null;
  isStockTracked: boolean;
  unitPricePoisha: number;
  lineDiscountPoisha: number;
};

export type OrderStageHistoryEntry = {
  id: string;
  from: OrderStage;
  to: OrderStage;
  actorType: string;
  actorUserId: string | null;
  actorStaffId: string | null;
  reason: string | null;
  occurredAt: string;
};

export type OrderDetail = OrderSummary & {
  buyerContactId: string | null;
  isRecipientBuyer: boolean;
  recipientPhone: string;
  recipientAddress: string;
  recipientDistrict: string;
  recipientBdAreaId: number | null;
  isDeliveryChargeOverridden: boolean;
  onHoldReason: (typeof onHoldReasons)[number] | null;
  followUpOn: string | null;
  cancelReason: (typeof cancelReasons)[number] | null;
  possibleDuplicateOfOrderId: string | null;
  items: OrderItem[];
  timeline: OrderStageHistoryEntry[];
};

export const orderStageChangeSchema = z.discriminatedUnion('to', [
  z.strictObject({ to: z.literal('to_confirm') }),
  z.strictObject({ to: z.literal('to_pack') }),
  z.strictObject({
    to: z.literal('on_hold'),
    reason: z.enum(onHoldReasons),
    followUpOn: z.iso
      .date()
      .refine((date) => !date.startsWith('0000-'), 'Enter a valid follow-up date')
      .optional(),
  }),
  z.strictObject({ to: z.literal('cancelled'), reason: z.enum(cancelReasons) }),
]);
export type OrderStageChange = z.infer<typeof orderStageChangeSchema>;

const money = z.int().nonnegative();
const buyerSchema = z.union([
  z.strictObject({ contactId: z.uuid() }),
  z.strictObject({ name: z.string().trim().min(1).max(120), phone: bdMobileSchema.optional() }),
]);
const recipientSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  phone: bdMobileSchema,
  address: z.string().trim().min(1).max(500),
  areaId: z.int().positive().max(2147483647),
  isBuyer: z.boolean().default(true),
});
const orderLines = z
  .array(
    z.strictObject({
      variantId: z.uuid().toLowerCase(),
      quantity: z.int().positive().max(2147483647),
      lineDiscountPoisha: money.default(0),
    }),
  )
  .min(1)
  .max(100)
  .refine(
    (items) => new Set(items.map(({ variantId }) => variantId)).size === items.length,
    'Choose each variant once',
  );

export const createOrderSchema = z.strictObject({
  buyer: buyerSchema,
  recipient: recipientSchema,
  items: orderLines,
  deliveryChargePoisha: money.optional(),
  orderDiscountPoisha: money.default(0),
  advancePaidPoisha: money.default(0),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderIdempotencyKeySchema = z.string().trim().min(1).max(128);
