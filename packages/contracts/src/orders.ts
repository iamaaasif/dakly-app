import { z } from 'zod';

import type { returnRiskLevels } from './contacts';
import { bdMobileSchema } from './phone';
import {
  productListQuerySchema,
  takaInput,
  type ProductResponse,
  type ProductVariantResponse,
} from './products';

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
export const orderStageTransitions: Record<OrderStage, readonly OrderStage[]> = {
  to_confirm: ['to_pack', 'on_hold', 'cancelled'],
  on_hold: ['to_confirm', 'to_pack', 'cancelled'],
  to_pack: ['with_courier', 'on_hold', 'cancelled'],
  with_courier: ['delivered', 'partially_delivered', 'returned'],
  delivered: ['returned'],
  partially_delivered: ['returned'],
  returned: [],
  cancelled: [],
};

export const orderTabs = [
  'to_confirm',
  'to_pack',
  'with_courier',
  'delivered',
  'returned',
] as const;

export type OrderReturnRisk = (typeof returnRiskLevels)[number] | null;

const searchText = z.string().trim().min(1).max(120);
const calendarDate = z.iso.date().refine((date) => !date.startsWith('0000-'), 'Enter a valid date');

export const orderListQuerySchema = z
  .strictObject({
    stage: z.enum(orderStages).optional(),
    source: z.enum(orderSources).optional(),
    courier: z.enum(couriers).optional(),
    createdFrom: calendarDate.optional(),
    createdThrough: calendarDate.optional(),
    alert: z.enum(['waiting', 'risk', 'cod']).optional(),
    search: searchText.refine((text) => !text.includes('\0')).optional(),
    cursor: z.coerce.number<string>().int().positive().max(2147483647).optional(),
    limit: z.coerce.number<string>().int().min(1).max(100).default(50),
  })
  .refine(
    ({ createdFrom, createdThrough }) =>
      !createdFrom || !createdThrough || createdFrom <= createdThrough,
    {
      path: ['createdThrough'],
      message: 'End date must be on or after the start date',
    },
  );

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export const orderScreenQuerySchema = orderListQuerySchema.safeExtend({
  selected: z.uuid().optional(),
});

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
  totalPoisha: number;
  advancePaidPoisha: number;
  codAmountPoisha: number;
  codCollectedPoisha: number | null;
  deliveredItemsSubtotalPoisha: number | null;
  deliveredOrderDiscountPoisha: number | null;
  createdAt: string;
  returnRisk: OrderReturnRisk;
};

export type OrderListItem = OrderSummary & {
  itemPreview: string | null;
  isWaitingForConfirmation: boolean;
};
export type OrderAlerts = {
  waiting: number;
  highRisk: number;
  codAwaitingOrders: number;
  codAwaitingPoisha: string;
};

export type OrderListResponse = {
  items: OrderListItem[];
  alerts: OrderAlerts;
  counts: Record<OrderStage, number>;
  nextCursor: number | null;
};

export const orderCatalogueQuerySchema = productListQuerySchema.pick({
  cursor: true,
  limit: true,
  search: true,
});
export type OrderCatalogueQuery = z.infer<typeof orderCatalogueQuerySchema>;
export type OrderCatalogueProduct = Pick<ProductResponse, 'id' | 'name' | 'isStockTracked'> & {
  variants: Pick<
    ProductVariantResponse,
    'id' | 'title' | 'isDefault' | 'pricePoisha' | 'available'
  >[];
};
export type OrderCataloguePage = { items: OrderCatalogueProduct[]; nextCursor: string | null };

export type OrderItem = {
  id: string;
  variantId: string;
  productId: string | null;
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
  hasRecipientPhoneMatch: boolean;
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
      itemId: z.uuid().toLowerCase(),
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
    reason: z.enum(onHoldReasons, 'Choose a reason.'),
    followUpOn: calendarDate.optional(),
  }),
  z.strictObject({ to: z.literal('cancelled'), reason: z.enum(cancelReasons, 'Choose a reason.') }),
  z.strictObject({ to: z.literal('delivered') }),
  z.strictObject({
    to: z.literal('partially_delivered'),
    items: deliveredLines,
    note: z.string().trim().min(1).max(200),
  }),
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
  areaId: z.int().positive('Choose a district or upazila').max(2147483647),
  isBuyer: z.boolean().default(true),
});
const orderLines = z
  .array(
    z.strictObject({
      variantId: z.uuid('Choose a product and variant').toLowerCase(),
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

export const createOrderFormSchema = createOrderSchema.extend({
  deliveryChargePoisha: takaInput.optional(),
  orderDiscountPoisha: takaInput.default(0),
  advancePaidPoisha: takaInput.default(0),
});
export type CreateOrderValues = z.input<typeof createOrderFormSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderIdempotencyKeySchema = z.string().trim().min(1).max(128);
export const editOrderSchema = z.strictObject({
  items: orderLines,
  recipient: recipientSchema
    .omit({ isBuyer: true })
    .partial()
    .extend({ isBuyer: z.boolean().optional() })
    .optional(),
  deliveryChargePoisha: money.optional(),
  orderDiscountPoisha: money.optional(),
  advancePaidPoisha: money.optional(),
});
export type EditOrderInput = z.infer<typeof editOrderSchema>;
export const editOrderFormSchema = editOrderSchema.extend({
  deliveryChargePoisha: takaInput.optional(),
  orderDiscountPoisha: takaInput.optional(),
  advancePaidPoisha: takaInput.optional(),
});

export type EditOrderValues = z.input<typeof editOrderFormSchema>;
export type OrderEditorValues = CreateOrderValues | EditOrderValues;
