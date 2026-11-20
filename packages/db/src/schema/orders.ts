import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type PgTableExtraConfigValue,
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
  discountCodeKinds,
  discountCodeSourceTypes,
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
import { bytea, citext, createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
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
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('delivery_zones_store_id_id_key').on(table.storeId, table.id),

    index('delivery_zones_store_id_idx').on(table.storeId),
    index('delivery_zones_bd_area_ids_idx').using('gin', table.bdAreaIds),
    uniqueIndex('delivery_zones_one_default_key')
      .on(table.storeId)
      .where(sql`${table.isDefault}`),
    check('delivery_zones_charge', sql`${table.chargePoisha} >= 0`),
  ],
);

// A shop's discount code (feature 09 offer step and the "give a coupon code" workflow action).
// A code made for one person carries contact_id. Not Dakly's plan coupons, which are `coupons`.
export const discountCodes = pgTable(
  'discount_codes',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    code: citext('code').notNull(),
    kind: text('kind', { enum: discountCodeKinds }).notNull(),
    discountPercent: integer('discount_percent'),
    discountAmountPoisha: poisha('discount_amount_poisha'),
    minimumOrderPoisha: poisha('minimum_order_poisha'),
    sourceType: text('source_type', { enum: discountCodeSourceTypes }).notNull(),
    sourceId: uuid('source_id'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    validFrom: timestamptz('valid_from').notNull(),
    validUntil: timestamptz('valid_until'),
    maxRedemptions: integer('max_redemptions'),
    redemptionCount: integer('redemption_count').notNull().default(0),
    isDisabled: boolean('is_disabled').notNull().default(false),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('discount_codes_store_id_id_key').on(table.storeId, table.id),
    uniqueIndex('discount_codes_store_id_code_key').on(table.storeId, table.code),
    foreignKey({
      name: 'discount_codes_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    index('discount_codes_store_id_source_idx').on(table.storeId, table.sourceType, table.sourceId),
    index('discount_codes_contact_id_idx').on(table.contactId),
    index('discount_codes_created_by_user_id_idx').on(table.createdByUserId),
    check('discount_codes_kind', isOneOf(table.kind, discountCodeKinds)),
    check('discount_codes_source_type', isOneOf(table.sourceType, discountCodeSourceTypes)),
    check(
      'discount_codes_value',
      sql`(${table.kind} = 'percent' and ${table.discountPercent} between 1 and 100 and ${table.discountAmountPoisha} is null) or (${table.kind} = 'amount' and ${table.discountAmountPoisha} > 0 and ${table.discountPercent} is null) or (${table.kind} = 'free_delivery' and ${table.discountPercent} is null and ${table.discountAmountPoisha} is null)`,
    ),
    check(
      'discount_codes_redemptions',
      sql`${table.maxRedemptions} is null or ${table.redemptionCount} <= ${table.maxRedemptions}`,
    ),
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
    // Purge detaches the buyer but retains their permitted name snapshot, never the recipient's.
    buyerName: text('buyer_name'),
    buyerContactId: uuid('buyer_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    source: text('source', { enum: orderSources }).notNull(),
    createdByType: text('created_by_type', { enum: orderCreatorTypes }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    // D26: the delivery recipient is a snapshot on the order. It may be someone other than the
    // buyer (buyer_contact_id), is never used to find or merge a contact, and later profile edits do
    // not change it. Return risk is keyed on recipient_phone. When the recipient is the buyer (the default) the
    // buyer's own phone is also saved on their contact when free (D27).
    isRecipientBuyer: boolean('is_recipient_buyer').notNull().default(true),
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
    // ORD-R5. items_subtotal = sum(quantity x unit price - line discount) over the lines;
    // COD = max(0, items_subtotal - order_discount + delivery charge - advance).
    itemsSubtotalPoisha: poisha('items_subtotal_poisha').notNull(),
    orderDiscountPoisha: poisha('order_discount_poisha').notNull().default(0),
    deliveredItemsSubtotalPoisha: poisha('delivered_items_subtotal_poisha'),
    deliveredOrderDiscountPoisha: poisha('delivered_order_discount_poisha'),
    discountCodeId: uuid('discount_code_id').references(() => discountCodes.id),
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
    attributedTouchId: uuid('attributed_touch_id'),
    // When the winning read, tap or delivery happened, not when attribution was calculated.
    attributedTouchAt: timestamptz('attributed_touch_at'),
    attributedAmountPoisha: poisha('attributed_amount_poisha'),
    attributedWindowDays: smallint('attributed_window_days'),
    possibleDuplicateOfOrderId: uuid('possible_duplicate_of_order_id').references(
      (): AnyPgColumn => orders.id,
    ),
    note: text('note'),
    externalRef: text('external_ref'),
    idempotencyKey: text('idempotency_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('orders_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'orders_buyer_contact_id_store_fk',
      columns: [table.storeId, table.buyerContactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'orders_conversation_id_store_fk',
      columns: [table.storeId, table.conversationId],
      foreignColumns: [conversations.storeId, conversations.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'orders_discount_code_id_store_fk',
      columns: [table.storeId, table.discountCodeId],
      foreignColumns: [discountCodes.storeId, discountCodes.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'orders_delivery_zone_id_store_fk',
      columns: [table.storeId, table.deliveryZoneId],
      foreignColumns: [deliveryZones.storeId, deliveryZones.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'orders_possible_duplicate_of_order_id_store_fk',
      columns: [table.storeId, table.possibleDuplicateOfOrderId],
      foreignColumns: [orders.storeId, orders.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('orders_store_id_number_key').on(table.storeId, table.number),
    uniqueIndex('orders_store_id_idempotency_key_key')
      .on(table.storeId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex('orders_store_id_external_ref_key')
      .on(table.storeId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    index('orders_store_id_stage_idx').on(table.storeId, table.stage, table.createdAt),
    index('orders_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('orders_store_id_buyer_contact_idx').on(
      table.storeId,
      table.buyerContactId,
      table.createdAt,
    ),
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
    ...orderForeignKeyIndexes(table),
    ...orderChecks(table),
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
    // The whole discount on this line, not per unit.
    lineDiscountPoisha: poisha('line_discount_poisha').notNull().default(0),
    deliveredLineDiscountPoisha: poisha('delivered_line_discount_poisha'),
    isStockTracked: boolean('is_stock_tracked').notNull(),
    // ORD-R3: a person ticked "Allow even though out of stock". The AI can never set it.
    isOversellAllowed: boolean('is_oversell_allowed').notNull().default(false),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'order_items_order_id_store_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'order_items_variant_id_store_fk',
      columns: [table.storeId, table.variantId],
      foreignColumns: [productVariants.storeId, productVariants.id] as [AnyPgColumn, AnyPgColumn],
    }),

    index('order_items_order_id_idx').on(table.orderId),
    index('order_items_store_id_variant_idx').on(table.storeId, table.variantId),
    index('order_items_variant_id_idx').on(table.variantId),
    check(
      'order_items_quantity',
      sql`${table.quantity} > 0 and coalesce(${table.deliveredQuantity}, 0) between 0 and ${table.quantity}`,
    ),
    check(
      'order_items_money',
      sql`${table.unitPricePoisha} > 0 and ${table.lineDiscountPoisha} >= 0`,
    ),
  ],
);

// The link in a confirmation SMS carries a random token. Only its sha256 is kept, so the link
// cannot be rebuilt or guessed from the database. A new message about the order replaces the token.
export const orderConfirmations = pgTable(
  'order_confirmations',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    orderId: uuid('order_id').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: createdAt(),
    usedAt: timestamptz('used_at'),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'order_confirmations_order_id_store_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    uniqueIndex('order_confirmations_store_order_key').on(table.storeId, table.orderId),
    uniqueIndex('order_confirmations_token_hash_key').on(table.tokenHash),
    index('order_confirmations_order_id_idx').on(table.orderId),
  ],
);

// One index per foreign key, so deleting or merging the parent never scans orders.
function orderForeignKeyIndexes(
  table: Record<keyof typeof orders.$inferSelect, AnyPgColumn>,
): PgTableExtraConfigValue[] {
  return [
    index('orders_buyer_contact_id_idx').on(table.buyerContactId),
    index('orders_conversation_id_idx').on(table.conversationId),
    index('orders_discount_code_id_idx').on(table.discountCodeId),
    index('orders_created_by_user_id_idx').on(table.createdByUserId),
    index('orders_shipped_by_user_id_idx').on(table.shippedByUserId),
    index('orders_recipient_bd_area_id_idx').on(table.recipientBdAreaId),
    index('orders_delivery_zone_id_idx').on(table.deliveryZoneId),
    index('orders_possible_duplicate_idx').on(table.possibleDuplicateOfOrderId),
  ];
}

function orderChecks(
  table: Record<keyof typeof orders.$inferSelect, AnyPgColumn>,
): PgTableExtraConfigValue[] {
  return [
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
      sql`${table.itemsSubtotalPoisha} >= 0 and ${table.orderDiscountPoisha} >= 0 and ${table.deliveryChargePoisha} >= 0 and ${table.advancePaidPoisha} >= 0 and ${table.codAmountPoisha} >= 0`,
    ),
    check('orders_number', sql`${table.number} > 0`),
  ];
}
