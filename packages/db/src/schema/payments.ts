import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  boolean,
  check,
  date,
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
  settlementLineStatuses,
} from '@dakly/contracts/payments';

import { staffUsers } from './admin';
import { users } from './auth';
import { invoices } from './billing';
import { bytea, createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { orders } from './orders';
import { files } from './platform';
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
    uniqueIndex('payment_gateway_credentials_store_id_id_key').on(table.storeId, table.id),

    uniqueIndex('payment_gateway_credentials_active_key')
      .on(table.storeId, table.gateway, table.mode)
      .where(sql`${table.status} <> 'disconnected'`),
    index('payment_gateway_credentials_store_id_idx').on(table.storeId),
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
    allowedPaymentMethods: text('allowed_payment_methods').array(),
    gatewayPaymentId: text('gateway_payment_id'),
    gatewayTransactionId: text('gateway_transaction_id'),
    status: text('status', { enum: paymentIntentStatuses }).notNull().default('created'),
    reviewReason: text('review_reason', { enum: paymentReviewReasons }),
    verifiedAmountPoisha: poisha('verified_amount_poisha'),
    refundedPoisha: poisha('refunded_poisha').notNull().default(0),
    reservedRefundPoisha: poisha('reserved_refund_poisha').notNull().default(0),
    maskedCardLabel: text('masked_card_label'),
    failureReason: text('failure_reason'),
    isSandbox: boolean('is_sandbox').notNull().default(false),
    expiresAt: timestamptz('expires_at').notNull(),
    // A voided link cannot start a new attempt, but an attempt already started can still settle.
    voidedAt: timestamptz('voided_at'),
    succeededAt: timestamptz('succeeded_at'),
    // Billing flow only: set when a gateway settlement line confirms the money arrived.
    settledAt: timestamptz('settled_at'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
    nextCheckAt: timestamptz('next_check_at'),
    checkCount: smallint('check_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('payment_intents_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'payment_intents_credential_id_store_fk',
      columns: [table.storeId, table.credentialId],
      foreignColumns: [paymentGatewayCredentials.storeId, paymentGatewayCredentials.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),
    foreignKey({
      name: 'payment_intents_order_id_store_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'payment_intents_invoice_id_store_fk',
      columns: [table.storeId, table.invoiceId],
      foreignColumns: [invoices.storeId, invoices.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('payment_intents_merchant_reference_key').on(table.merchantReference),
    uniqueIndex('payment_intents_short_code_key').on(table.shortCode),
    // PAY-R3: one gateway transaction can be linked to only one intent.
    uniqueIndex('payment_intents_gateway_transaction_id_key')
      .on(table.gateway, table.gatewayTransactionId)
      .where(sql`${table.gatewayTransactionId} is not null`),
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
      sql`${table.refundedPoisha} >= 0 and ${table.reservedRefundPoisha} >= 0
        and ${table.refundedPoisha} + ${table.reservedRefundPoisha} <= coalesce(${table.verifiedAmountPoisha}, 0)`,
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
    gateway: text('gateway', { enum: gateways }),
    gatewayEventId: text('gateway_event_id'),
    eventPayload: jsonb('event_payload'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'payment_events_payment_intent_id_store_fk',
      columns: [table.storeId, table.paymentIntentId],
      foreignColumns: [paymentIntents.storeId, paymentIntents.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('payment_events_gateway_event_key').on(table.gateway, table.gatewayEventId),
    index('payment_events_intent_idx').on(table.storeId, table.paymentIntentId, table.createdAt),
    index('payment_events_payment_intent_id_idx').on(table.paymentIntentId),
    check('payment_events_kind', isOneOf(table.kind, paymentEventKinds)),
  ],
);

// Reserve on the common intent under a row lock before inserting; release the lock before
// gateway calls. Succeeded and recorded_manually refunds consume captured funds; requested and
// pending amounts stay reserved until a confirmed outcome (PAY-R10).
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
    foreignKey({
      name: 'refunds_payment_intent_id_store_fk',
      columns: [table.storeId, table.paymentIntentId],
      foreignColumns: [paymentIntents.storeId, paymentIntents.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('refunds_store_id_idempotency_key_key').on(table.storeId, table.idempotencyKey),
    index('refunds_payment_intent_id_idx').on(table.paymentIntentId),
    index('refunds_requested_by_user_id_idx').on(table.requestedByUserId),
    check('refunds_status', isOneOf(table.status, refundStatuses)),
    check('refunds_amount', sql`${table.amountPoisha} > 0`),
  ],
);

// Lines from the nightly settlement report of Dakly's own merchant accounts (billing flow). Shops'
// own money is never reconciled here (D14). Unmatched lines and payments no line confirmed after
// 3 days form the admin reconciliation queue.
export const gatewaySettlementLines = pgTable(
  'gateway_settlement_lines',
  {
    id: id(),
    gateway: text('gateway', { enum: gateways }).notNull(),
    settlementDate: date('settlement_date').notNull(),
    gatewayTransactionId: text('gateway_transaction_id').notNull(),
    amountPoisha: poisha('amount_poisha').notNull(),
    feePoisha: poisha('fee_poisha').notNull().default(0),
    reportFileId: uuid('report_file_id').references(() => files.id),
    paymentIntentId: uuid('payment_intent_id').references(() => paymentIntents.id),
    status: text('status', { enum: settlementLineStatuses }).notNull().default('unmatched'),
    matchedByStaffId: uuid('matched_by_staff_id').references(() => staffUsers.id),
    note: text('note'),
    matchedAt: timestamptz('matched_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('gateway_settlement_lines_transaction_key').on(
      table.gateway,
      table.gatewayTransactionId,
    ),
    index('gateway_settlement_lines_queue_idx')
      .on(table.settlementDate)
      .where(sql`${table.status} in ('unmatched', 'escalated')`),
    index('gateway_settlement_lines_payment_intent_id_idx').on(table.paymentIntentId),
    index('gateway_settlement_lines_report_file_id_idx').on(table.reportFileId),
    index('gateway_settlement_lines_matched_by_staff_id_idx').on(table.matchedByStaffId),
    check('gateway_settlement_lines_gateway', isOneOf(table.gateway, gateways)),
    check('gateway_settlement_lines_status', isOneOf(table.status, settlementLineStatuses)),
    check(
      'gateway_settlement_lines_amounts',
      sql`${table.amountPoisha} > 0 and ${table.feePoisha} >= 0`,
    ),
  ],
);
