import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  attributionSourceTypes,
  cancelReasons,
  couriers,
  onHoldReasons,
  orderConfirmationMethods,
  orderCreatorTypes,
  orderPaymentStatuses,
  orderSources,
  orderStages,
} from '@dakly/contracts/orders';
import { bdAreas } from './areas';
import { users } from './auth';
import { conversations } from './chats';
import { createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { productVariants } from './products';
import { stores } from './stores';

// A shop's delivery charge table: inside Dhaka, suburbs, outside Dhaka by default. An area not
// listed in any zone falls to the default zone. The service checks an area is in one zone only.
export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    chargePoisha: poisha('charge_poisha').notNull(),
    bdAreaIds: integer('bd_area_ids')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    isDefault: boolean('is_default').notNull().default(false),
    position: smallint('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('delivery_zones_store_id_idx').on(table.storeId),
    index('delivery_zones_bd_area_ids_idx').using('gin', table.bdAreaIds),
    uniqueIndex('delivery_zones_one_default_key')
      .on(table.storeId)
      .where(sql`${table.isDefault}`),
    check('delivery_zones_charge', sql`${table.chargePoisha} >= 0`),
  ],
);

// stage is fulfilment, payment_status is money; both change only through OrdersService and every
// change writes an audit_log row (the order timeline). Courier fields are typed by staff in
// release 1 (D21); courier tables come with the courier release.
export const orders = pgTable(
  'orders',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    number: integer('number').notNull(),
    // The buyer. Purchase history, spend and attribution count the order once, here.
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    source: text('source', { enum: orderSources }).notNull(),
    createdByType: text('created_by_type', { enum: orderCreatorTypes }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    // D26: the delivery recipient is a snapshot on the order. It may be someone other than the
    // buyer (contact_id), is never used to find or merge a contact, and later profile edits do
    // not change it. Return risk is keyed on recipient_phone. For self-delivery (the default) the
    // buyer's own phone is also saved on their contact when free (D27).
    isSelfDelivery: boolean('is_self_delivery').notNull().default(true),
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    recipientAddress: text('recipient_address').notNull(),
    recipientDistrict: text('recipient_district').notNull(),
    recipientBdAreaId: integer('recipient_bd_area_id').references(() => bdAreas.id),
    deliveryZoneId: uuid('delivery_zone_id').references(() => deliveryZones.id),
    stage: text('stage', { enum: orderStages }).notNull().default('to_confirm'),
    onHoldReason: text('on_hold_reason', { enum: onHoldReasons }),
    followUpOn: date('follow_up_on'),
    cancelReason: text('cancel_reason', { enum: cancelReasons }),
    returnReason: text('return_reason'),
    paymentStatus: text('payment_status', { enum: orderPaymentStatuses })
      .notNull()
      .default('cod_pending'),
    itemsTotalPoisha: poisha('items_total_poisha').notNull(),
    discountPoisha: poisha('discount_poisha').notNull().default(0),
    deliveryChargePoisha: poisha('delivery_charge_poisha').notNull().default(0),
    isDeliveryChargeOverridden: boolean('is_delivery_charge_overridden').notNull().default(false),
    advancePaidPoisha: poisha('advance_paid_poisha').notNull().default(0),
    // ORD-R5: computed by the service, never typed.
    codAmountPoisha: poisha('cod_amount_poisha').notNull(),
    codCollectedPoisha: poisha('cod_collected_poisha'),
    courier: text('courier', { enum: couriers }),
    courierOtherName: text('courier_other_name'),
    trackingCode: text('tracking_code'),
    courierChargePoisha: poisha('courier_charge_poisha'),
    codFeePoisha: poisha('cod_fee_poisha'),
    // How the order was confirmed. Status only: it never merges contacts or proves identity (D26).
    confirmationMethod: text('confirmation_method', { enum: orderConfirmationMethods }),
    confirmedAt: timestamptz('confirmed_at'),
    shippedAt: timestamptz('shipped_at'),
    shippedByUserId: uuid('shipped_by_user_id').references(() => users.id),
    deliveredAt: timestamptz('delivered_at'),
    returnedAt: timestamptz('returned_at'),
    cancelledAt: timestamptz('cancelled_at'),
    codCollectedAt: timestamptz('cod_collected_at'),
    // Last-touch attribution (glossary). At most one per order, so it lives on the order.
    attributedSourceType: text('attributed_source_type', { enum: attributionSourceTypes }),
    attributedSourceId: uuid('attributed_source_id'),
    attributedChannel: text('attributed_channel'),
    attributedAt: timestamptz('attributed_at'),
    possibleDuplicateOfOrderId: uuid('possible_duplicate_of_order_id').references(
      (): AnyPgColumn => orders.id,
    ),
    note: text('note'),
    externalRef: text('external_ref'),
    idempotencyKey: text('idempotency_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('orders_store_id_number_key').on(table.storeId, table.number),
    uniqueIndex('orders_store_id_idempotency_key_key')
      .on(table.storeId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex('orders_store_id_external_ref_key')
      .on(table.storeId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    index('orders_store_id_stage_idx').on(table.storeId, table.stage, table.createdAt),
    index('orders_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('orders_store_id_contact_idx').on(table.storeId, table.contactId, table.createdAt),
    // Duplicate check (same phone within 24 hours) and the per-phone order link limit.
    index('orders_store_id_recipient_phone_idx').on(
      table.storeId,
      table.recipientPhone,
      table.createdAt,
    ),
    // Return risk: delivered and returned parcels for one delivery phone (D12, D26).
    index('orders_store_id_recipient_phone_outcome_idx')
      .on(table.storeId, table.recipientPhone)
      .where(sql`${table.stage} in ('delivered', 'partially_delivered', 'returned')`),
    index('orders_store_id_attribution_idx')
      .on(table.storeId, table.attributedSourceType, table.attributedSourceId)
      .where(sql`${table.attributedSourceType} is not null`),
    index('orders_store_id_follow_up_idx')
      .on(table.storeId, table.followUpOn)
      .where(sql`${table.stage} = 'on_hold'`),
    index('orders_contact_id_idx').on(table.contactId),
    index('orders_conversation_id_idx').on(table.conversationId),
    index('orders_created_by_user_id_idx').on(table.createdByUserId),
    index('orders_shipped_by_user_id_idx').on(table.shippedByUserId),
    index('orders_recipient_bd_area_id_idx').on(table.recipientBdAreaId),
    index('orders_delivery_zone_id_idx').on(table.deliveryZoneId),
    index('orders_possible_duplicate_idx').on(table.possibleDuplicateOfOrderId),
    check('orders_source', isOneOf(table.source, orderSources)),
    check('orders_created_by_type', isOneOf(table.createdByType, orderCreatorTypes)),
    check('orders_stage', isOneOf(table.stage, orderStages)),
    check('orders_payment_status', isOneOf(table.paymentStatus, orderPaymentStatuses)),
    check(
      'orders_on_hold_reason',
      sql`(${table.stage} = 'on_hold') = (${table.onHoldReason} is not null)`,
    ),
    check(
      'orders_cancel_reason',
      sql`(${table.stage} = 'cancelled') = (${table.cancelReason} is not null)`,
    ),
    check('orders_courier', isOneOf(table.courier, couriers)),
    check(
      'orders_confirmation_method',
      isOneOf(table.confirmationMethod, orderConfirmationMethods),
    ),
    check(
      'orders_attributed_source_type',
      isOneOf(table.attributedSourceType, attributionSourceTypes),
    ),
    check('orders_recipient_phone_format', sql`${table.recipientPhone} ~ '^01[3-9][0-9]{8}$'`),
    check(
      'orders_money',
      sql`${table.itemsTotalPoisha} >= 0 and ${table.discountPoisha} >= 0 and ${table.deliveryChargePoisha} >= 0 and ${table.advancePaidPoisha} >= 0 and ${table.codAmountPoisha} >= 0`,
    ),
    check('orders_number', sql`${table.number} > 0`),
  ],
);

// Prices and cost are copied at order time, so later product edits never change an order.
export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    productName: text('product_name').notNull(),
    variantTitle: text('variant_title').notNull(),
    quantity: integer('quantity').notNull(),
    deliveredQuantity: integer('delivered_quantity'),
    unitPricePoisha: poisha('unit_price_poisha').notNull(),
    unitCostPoisha: poisha('unit_cost_poisha'),
    discountPoisha: poisha('discount_poisha').notNull().default(0),
    isStockTracked: boolean('is_stock_tracked').notNull(),
    // ORD-R3: a person ticked "Allow even though out of stock". The AI can never set it.
    isOversellAllowed: boolean('is_oversell_allowed').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.orderId),
    index('order_items_store_id_variant_idx').on(table.storeId, table.variantId),
    index('order_items_variant_id_idx').on(table.variantId),
    check(
      'order_items_quantity',
      sql`${table.quantity} > 0 and coalesce(${table.deliveredQuantity}, 0) between 0 and ${table.quantity}`,
    ),
    check('order_items_money', sql`${table.unitPricePoisha} > 0 and ${table.discountPoisha} >= 0`),
  ],
);
