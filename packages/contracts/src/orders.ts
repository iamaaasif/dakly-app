import { z } from 'zod';

import type { returnRiskLevels } from './contacts';
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
export type OrderReturnRisk = (typeof returnRiskLevels)[number] | null;

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
  returnRisk: OrderReturnRisk;
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
  deliveredLineDiscountPoisha: number | null;
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
  courier: (typeof couriers)[number] | null;
  courierOtherName: string | null;
  trackingCode: string | null;
  shippedAt: string | null;
  shippedByUserId: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  codCollectedAt: string | null;
  codCollectedPoisha: number | null;
  deliveredItemsSubtotalPoisha: number | null;
  deliveredOrderDiscountPoisha: number | null;
  possibleDuplicateOfOrderId: string | null;
  items: OrderItem[];
  timeline: OrderStageHistoryEntry[];
};

const courierText = z.string().trim().min(1).max(100).optional();
export const dispatchOrderSchema = z
  .strictObject({
    courier: z.enum(couriers).optional(),
    courierOtherName: courierText,
    trackingCode: courierText,
  })
  .refine((input) => (input.courier === 'other') === (input.courierOtherName !== undefined), {
    path: ['courierOtherName'],
    message: 'Enter a name only for Other courier',
  });
export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;

const deliveredLines = z
  .array(
    z.strictObject({
      itemId: z.uuid(),
      quantity: z.int().min(0).max(2147483647),
    }),
  )
  .min(1)
  .max(100)
  .refine(
    (items) => new Set(items.map(({ itemId }) => itemId)).size === items.length,
    'Enter the delivered quantity for each item once',
  );

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
  z.strictObject({ to: z.literal('delivered') }),
  z.strictObject({ to: z.literal('partially_delivered'), items: deliveredLines }),
  z.strictObject({
    to: z.literal('returned'),
    reason: z.string().trim().min(1).max(200),
    isDamaged: z.boolean().default(false),
  }),
]);
export type OrderStageChange =
  z.infer<typeof orderStageChangeSchema> | ({ to: 'with_courier' } & DispatchOrderInput);

const money = z.int().nonnegative();
export const codCollectedSchema = z.strictObject({ amountPoisha: money });
export type CodCollectedInput = z.infer<typeof codCollectedSchema>;

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
      variantId: z.uuid(),
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
export const editOrderSchema = z.strictObject({
  items: orderLines,
  recipient: recipientSchema.optional(),
  deliveryChargePoisha: money.optional(),
  orderDiscountPoisha: money.optional(),
  advancePaidPoisha: money.optional(),
});
export type EditOrderInput = z.infer<typeof editOrderSchema>;
