import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  gatewayCredentialStatuses,
  gatewayModes,
  gateways,
  paymentEventKinds,
  paymentFlows,
  paymentGateways,
  paymentIntentStatuses,
  paymentPurposes,
  paymentReviewReasons,
  refundStatuses,
} from '@dakly/contracts/payments';
import { users } from './auth';
import { invoices } from './billing';
import { bytea, createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { orders } from './orders';
import { stores } from './stores';

// A shop's own merchant keys (D14), AES-256-GCM with the store id as associated data, so a
// ciphertext copied into another store fails to decrypt. Write-only in the UI.
export const paymentGatewayCredentials = pgTable(
  'payment_gateway_credentials',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    gateway: text('gateway', { enum: gateways }).notNull(),
    mode: text('mode', { enum: gatewayModes }).notNull(),
    accountLabel: text('account_label').notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    keyVersion: smallint('key_version').notNull(),
    status: text('status', { enum: gatewayCredentialStatuses }).notNull().default('connected'),
    lastVerifiedAt: timestamptz('last_verified_at'),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('payment_gateway_credentials_active_key')
      .on(table.storeId, table.gateway, table.mode)
      .where(sql`${table.status} <> 'disconnected'`),
    index('payment_gateway_credentials_connected_by_user_id_idx').on(table.connectedByUserId),
    check('payment_gateway_credentials_gateway', isOneOf(table.gateway, gateways)),
    check('payment_gateway_credentials_mode', isOneOf(table.mode, gatewayModes)),
    check('payment_gateway_credentials_status', isOneOf(table.status, gatewayCredentialStatuses)),
  ],
);

// Every attempt to take money, in both flows, created before the customer sees a gateway page.
// Status only moves forward; every change writes a payment_events row.
export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    flow: text('flow', { enum: paymentFlows }).notNull(),
    purpose: text('purpose', { enum: paymentPurposes }).notNull(),
    gateway: text('gateway', { enum: paymentGateways }).notNull(),
    credentialId: uuid('credential_id').references(() => paymentGatewayCredentials.id),
    orderId: uuid('order_id').references(() => orders.id),
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    amountPoisha: poisha('amount_poisha').notNull(),
    currency: text('currency').notNull().default('BDT'),
    merchantReference: text('merchant_reference').notNull(),
    shortCode: text('short_code'),
    methods: text('methods').array(),
    gatewayPaymentId: text('gateway_payment_id'),
    gatewayTrxId: text('gateway_trx_id'),
    status: text('status', { enum: paymentIntentStatuses }).notNull().default('created'),
    reviewReason: text('review_reason', { enum: paymentReviewReasons }),
    verifiedAmountPoisha: poisha('verified_amount_poisha'),
    refundedPoisha: poisha('refunded_poisha').notNull().default(0),
    cardMasked: text('card_masked'),
    failureReason: text('failure_reason'),
    isSandbox: boolean('is_sandbox').notNull().default(false),
    expiresAt: timestamptz('expires_at').notNull(),
    // A voided link cannot start a new attempt, but an attempt already started can still settle.
    voidedAt: timestamptz('voided_at'),
    succeededAt: timestamptz('succeeded_at'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
    nextCheckAt: timestamptz('next_check_at'),
    checkCount: smallint('check_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('payment_intents_merchant_reference_key').on(table.merchantReference),
    uniqueIndex('payment_intents_short_code_key').on(table.shortCode),
    // PAY-R3: one gateway transaction can be linked to only one intent.
    uniqueIndex('payment_intents_gateway_trx_id_key')
      .on(table.gateway, table.gatewayTrxId)
      .where(sql`${table.gatewayTrxId} is not null`),
    index('payment_intents_store_id_order_id_idx').on(table.storeId, table.orderId),
    index('payment_intents_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('payment_intents_store_id_status_idx').on(table.storeId, table.status),
    index('payment_intents_check_due_idx')
      .on(table.nextCheckAt)
      .where(sql`${table.nextCheckAt} is not null`),
    index('payment_intents_order_id_idx').on(table.orderId),
    index('payment_intents_invoice_id_idx').on(table.invoiceId),
    index('payment_intents_credential_id_idx').on(table.credentialId),
    index('payment_intents_verified_by_user_id_idx').on(table.verifiedByUserId),
    index('payment_intents_created_by_user_id_idx').on(table.createdByUserId),
    check('payment_intents_flow', isOneOf(table.flow, paymentFlows)),
    check('payment_intents_purpose', isOneOf(table.purpose, paymentPurposes)),
    check('payment_intents_gateway', isOneOf(table.gateway, paymentGateways)),
    check('payment_intents_status', isOneOf(table.status, paymentIntentStatuses)),
    check('payment_intents_review_reason', isOneOf(table.reviewReason, paymentReviewReasons)),
    check('payment_intents_currency', sql`${table.currency} = 'BDT'`),
    check('payment_intents_amount', sql`${table.amountPoisha} > 0`),
    check(
      'payment_intents_refunded',
      sql`${table.refundedPoisha} between 0 and coalesce(${table.verifiedAmountPoisha}, ${table.amountPoisha})`,
    ),
    // PAY-R5: shop payments only on the shop's own credentials; Dakly billing never on them.
    check(
      'payment_intents_flow_credentials',
      sql`(${table.flow} = 'billing' and ${table.credentialId} is null and ${table.gateway} <> 'manual' and ${table.orderId} is null)
       or (${table.flow} = 'shop' and (${table.gateway} = 'manual') = (${table.credentialId} is null) and ${table.invoiceId} is null)`,
    ),
    check(
      'payment_intents_flow_purpose',
      sql`(${table.flow} = 'shop') = (${table.purpose} in ('order_advance', 'order_full'))`,
    ),
  ],
);

// Raw gateway evidence for disputes and reconciliation. Append-only; secrets are stripped.
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    kind: text('kind', { enum: paymentEventKinds }).notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    gatewayReference: text('gateway_reference'),
    data: jsonb('data'),
    createdAt: createdAt(),
  },
  (table) => [
    index('payment_events_intent_idx').on(table.storeId, table.paymentIntentId, table.createdAt),
    index('payment_events_payment_intent_id_idx').on(table.paymentIntentId),
    check('payment_events_kind', isOneOf(table.kind, paymentEventKinds)),
  ],
);

// The service sums requested, pending and succeeded refunds before inserting, in one guarded
// statement, so two staff refunding at once cannot exceed the captured amount (PAY-R10).
export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    amountPoisha: poisha('amount_poisha').notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: refundStatuses }).notNull().default('requested'),
    gatewayRefundId: text('gateway_refund_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    isApprovedWithTwoFactor: boolean('is_approved_with_two_factor').notNull().default(false),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('refunds_store_id_idempotency_key_key').on(table.storeId, table.idempotencyKey),
    index('refunds_payment_intent_id_idx').on(table.paymentIntentId),
    index('refunds_requested_by_user_id_idx').on(table.requestedByUserId),
    check('refunds_status', isOneOf(table.status, refundStatuses)),
    check('refunds_amount', sql`${table.amountPoisha} > 0`),
  ],
);
