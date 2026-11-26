import { z } from 'zod';

import { calendarDate } from './calendar-date';
import type { returnRiskLevels } from './contacts';
import { bdMobileSchema } from './phone';
import {
  productListQuerySchema,
  takaInput,
  type ProductResponse,
  type ProductVariantResponse,
} from './products';
import { searchText } from './search-text';

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
  'khata_import',
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
export type OrderConfirmationMethod = (typeof orderConfirmationMethods)[number];
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
export const orderStageLabels: Record<OrderStage, string> = {
  to_confirm: 'To confirm',
  on_hold: 'On hold',
  to_pack: 'To pack',
  with_courier: 'With courier',
  delivered: 'Delivered',
  partially_delivered: 'Partly delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

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

export const editableOrderStages: readonly OrderStage[] = ['to_confirm', 'on_hold', 'to_pack'];
export const editablePaymentStatuses: readonly (typeof orderPaymentStatuses)[number][] = [
  'cod_pending',
  'advance_paid',
];

export const orderTabs = [
  'to_confirm',
  'to_pack',
  'with_courier',
  'delivered',
  'returned',
] as const;

export type OrderReturnRisk = (typeof returnRiskLevels)[number] | null;
export type OrderParcelHistory = { parcels: number; returned: number };

const orderFiltersSchema = z.strictObject({
  stage: z.enum(orderStages).optional(),
  source: z.enum(orderSources).optional(),
  courier: z.enum(couriers).optional(),
  createdFrom: calendarDate.optional(),
  createdThrough: calendarDate.optional(),
  alert: z.enum(['waiting', 'risk', 'cod']).optional(),
  search: searchText.max(120).optional(),
  // One customer's orders, for the chat's customer panel.
  buyerContactId: z.uuid().optional(),
});

function orderDatesInSequence({
  createdFrom,
  createdThrough,
}: z.infer<typeof orderFiltersSchema>): boolean {
  return !createdFrom || !createdThrough || createdFrom <= createdThrough;
}

const reversedOrderDates = {
  path: ['createdThrough'],
  message: 'End date must be on or after the start date',
};

export const orderListQuerySchema = orderFiltersSchema
  .extend({
    cursor: z.coerce.number<string>().int().positive().max(2147483647).optional(),
    limit: z.coerce.number<string>().int().min(1).max(100).default(50),
  })
  .refine(orderDatesInSequence, reversedOrderDates);

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export const orderScreenQuerySchema = orderListQuerySchema.safeExtend({
  selected: z.uuid().optional(),
});

export const orderExportQuerySchema = orderFiltersSchema
  .extend({ format: z.enum(['csv', 'xlsx']) })
  .refine(orderDatesInSequence, reversedOrderDates);

export type OrderExportQuery = z.infer<typeof orderExportQuerySchema>;

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
  parcelHistory: OrderParcelHistory;
  courier: (typeof couriers)[number] | null;
  courierOtherName: string | null;
  returnedAt: string | null;
  returnReason: string | null;
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
  variants: (Pick<
    ProductVariantResponse,
    'id' | 'title' | 'isDefault' | 'pricePoisha' | 'available'
  > & { photoUrl: string | null })[];
};
export type OrderCataloguePage = { items: OrderCatalogueProduct[]; nextCursor: string | null };

export const orderCatalogueStockQuerySchema = z.strictObject({
  variantIds: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.uuid()).min(1).max(100)),
});
export type OrderCatalogueStock = { variantId: string; available: number }[];

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
  updatedAt: string;
  buyerContactId: string | null;
  isRecipientBuyer: boolean;
  hasRecipientPhoneMatch: boolean;
  recipientPhone: string | null;
  recipientAddress: string | null;
  recipientDistrict: string | null;
  recipientBdAreaId: number | null;
  isDeliveryChargeOverridden: boolean;
  onHoldReason: (typeof onHoldReasons)[number] | null;
  followUpOn: string | null;
  cancelReason: (typeof cancelReasons)[number] | null;
  trackingCode: string | null;
  shippedAt: string | null;
  shippedByUserId: string | null;
  deliveredAt: string | null;
  codCollectedAt: string | null;
  possibleDuplicateOfOrderId: string | null;
  items: OrderItem[];
  // Packed weight of all items in grams; null when any item's product has no weight set.
  parcelWeightGrams: number | null;
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

const partialDeliverySchema = z.strictObject({
  to: z.literal('partially_delivered'),
  items: deliveredLines,
  note: z.string('Enter a delivery note.').trim().min(1, 'Enter a delivery note.').max(200),
});

export function partialDeliveryFormSchema(ordered: Pick<OrderItem, 'id' | 'quantity'>[]) {
  const quantities = new Map(ordered.map(({ id, quantity }) => [id, quantity]));
  return partialDeliverySchema.extend({
    items: deliveredLines
      .refine((items) => items.some(({ quantity }) => quantity > 0), {
        path: [0, 'quantity'],
        message: 'Enter at least one delivered unit.',
      })
      .refine(
        (items) => items.some(({ itemId, quantity }) => quantity < (quantities.get(itemId) ?? 0)),
        {
          path: [0, 'quantity'],
          message: 'Use Mark delivered if all units arrived.',
        },
      ),
  });
}

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
  partialDeliverySchema,
  z.strictObject({
    to: z.literal('returned'),
    reason: z.string().trim().min(1).max(200),
    isDamaged: z.boolean().default(false),
  }),
]);
// The 32 random bytes of a confirm link, in base64url.
export const orderConfirmationTokenSchema = z.string().regex(/^[0-9A-Za-z_-]{43}$/);
export const orderConfirmationAnswerSchema = z.enum(['confirm', 'cancel']);
export type OrderConfirmationAnswer = z.infer<typeof orderConfirmationAnswerSchema>;

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
  confirm: z.boolean().default(false),
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
// An order made from a chat is for the chat's contact, so the buyer comes from the conversation.
export const createConversationOrderSchema = createOrderSchema.omit({ buyer: true });
export const createConversationOrderFormSchema = createOrderFormSchema.omit({ buyer: true });
export type CreateConversationOrderInput = z.infer<typeof createConversationOrderSchema>;
export type CreateConversationOrderValues = z.input<typeof createConversationOrderFormSchema>;
export type CreateOrderValues = z.input<typeof createOrderFormSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderLinkSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/);
const orderLinkAddress = {
  address: z.string().trim().min(1).max(500),
  areaId: z.int().positive().max(2147483647),
};
// The buyer sends no price, discount or delivery charge; the server works all three out.
export const placeOrderLinkOrderSchema = z.strictObject({
  botCheckToken: z.string().min(1).max(2048),
  idempotencyKey: z.uuid(),
  variantId: z.uuid().toLowerCase(),
  quantity: z.int().min(1).max(20),
  buyer: z.strictObject({ name: z.string().trim().min(1).max(120), phone: bdMobileSchema }),
  recipient: z.discriminatedUnion('isBuyer', [
    z.strictObject({ isBuyer: z.literal(true), ...orderLinkAddress }),
    z.strictObject({
      isBuyer: z.literal(false),
      name: z.string().trim().min(1).max(120),
      phone: bdMobileSchema,
      ...orderLinkAddress,
    }),
  ]),
});
export type PlaceOrderLinkOrderInput = z.infer<typeof placeOrderLinkOrderSchema>;
export type PlacedOrderLinkOrder = { orderNumber: number; totalPoisha: number };

export const orderIdempotencyKeySchema = z.string().trim().min(1).max(128);
export const editOrderSchema = z
  .strictObject({
    expectedUpdatedAt: z.iso.datetime({ precision: 3 }).optional(),
    items: orderLines.optional(),
    recipient: recipientSchema
      .omit({ isBuyer: true })
      .partial()
      .extend({ isBuyer: z.boolean().optional() })
      .optional(),
    deliveryChargePoisha: money.optional(),
    orderDiscountPoisha: money.optional(),
    advancePaidPoisha: money.optional(),
  })
  .refine(
    ({ expectedUpdatedAt: _expectedUpdatedAt, recipient, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined) ||
      Object.values(recipient ?? {}).some((value) => value !== undefined),
    'Change at least one order field',
  );
export type EditOrderInput = z.infer<typeof editOrderSchema>;
export const editOrderFormSchema = z.strictObject({
  ...editOrderSchema.shape,
  deliveryChargePoisha: takaInput.optional(),
  orderDiscountPoisha: takaInput.default(0),
  advancePaidPoisha: takaInput.optional(),
});

export type EditOrderValues = z.input<typeof editOrderFormSchema>;
export type OrderEditorValues = CreateOrderValues | EditOrderValues;
