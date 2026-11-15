import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type PgTableExtraConfigValue,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  billingCycles,
  couponKinds,
  couponDurations,
  invoiceKinds,
  invoiceStatuses,
  planKinds,
  renewalMethods,
  subscriptionItemStatuses,
  subscriptionStatuses,
  usageSources,
  usageUnits,
  walletEntryKinds,
  wallets,
} from '@dakly/contracts/billing';
import { actorTypes } from '@dakly/contracts/platform';

import { staffUsers } from './admin';
import { users } from './auth';
import { bytea, citext, createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { stores } from './stores';

// Global plan catalogue, edited in the admin app (Q1: prices are still open).
export const plans = pgTable(
  'plans',
  {
    id: id(),
    code: text('code').notNull(),
    kind: text('kind', { enum: planKinds }).notNull().default('plan'),
    name: text('name').notNull(),
    trialDays: smallint('trial_days').notNull().default(0),
    monthlyPricePoisha: poisha('monthly_price_poisha').notNull(),
    yearlyPricePoisha: poisha('yearly_price_poisha').notNull(),
    // Allowances per period: customers, seats, ai_conversation, ai_content, ai_ask, automations.
    limits: jsonb('limits').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    position: smallint('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('plans_code_key').on(table.code),
    check('plans_kind', isOneOf(table.kind, planKinds)),
    check('plans_trial_days', sql`${table.trialDays} between 0 and 90`),
    check(
      'plans_prices',
      sql`${table.monthlyPricePoisha} >= 0 and ${table.yearlyPricePoisha} >= 0`,
    ),
  ],
);

export const coupons = pgTable(
  'coupons',
  {
    id: id(),
    code: citext('code').notNull(),
    kind: text('kind', { enum: couponKinds }).notNull(),
    duration: text('duration', { enum: couponDurations }).notNull().default('once'),
    durationMonths: smallint('duration_months'),
    // Exactly one is set, matching kind.
    discountPercent: integer('discount_percent'),
    discountAmountPoisha: poisha('discount_amount_poisha'),
    planCodes: text('plan_codes').array(),
    validFrom: timestamptz('valid_from').notNull(),
    validUntil: timestamptz('valid_until'),
    maxRedemptions: integer('max_redemptions'),
    redemptionCount: integer('redemption_count').notNull().default(0),
    createdByStaffId: uuid('created_by_staff_id').references(() => staffUsers.id),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('coupons_code_key').on(table.code),
    index('coupons_created_by_staff_id_idx').on(table.createdByStaffId),
    check('coupons_kind', isOneOf(table.kind, couponKinds)),
    check('coupons_duration', isOneOf(table.duration, couponDurations)),
    check(
      'coupons_duration_months',
      sql`(${table.duration} = 'months' and ${table.durationMonths} is not null and ${table.durationMonths} between 1 and 36) or (${table.duration} in ('once', 'forever') and ${table.durationMonths} is null)`,
    ),
    check('coupons_redemption_count', sql`${table.redemptionCount} >= 0`),
    check(
      'coupons_value',
      sql`(${table.kind} = 'percent' and ${table.discountPercent} between 1 and 100 and ${table.discountAmountPoisha} is null) or (${table.kind} = 'amount' and ${table.discountAmountPoisha} > 0 and ${table.discountPercent} is null)`,
    ),
    check(
      'coupons_redemptions',
      sql`${table.maxRedemptions} is null or ${table.redemptionCount} <= ${table.maxRedemptions}`,
    ),
  ],
);

// Billing state per store (organisation billing waits for Q11). read_only is set on day 8 of
// past_due; one guard reads it and blocks AI replies, sends, posts and automations.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    billingCycle: text('billing_cycle', { enum: billingCycles }).notNull().default('monthly'),
    status: text('status', { enum: subscriptionStatuses }).notNull(),
    // The agreed price for the current period. A price change is stored as pending and starts
    // at price_change_starts_at, at least 30 days after the shop was told (ADM-R10).
    currentPeriodPricePoisha: poisha('current_period_price_poisha').notNull(),
    pendingPricePoisha: poisha('pending_price_poisha'),
    priceChangeNotifiedAt: timestamptz('price_change_notified_at'),
    priceChangeStartsAt: timestamptz('price_change_starts_at'),
    trialEndsAt: timestamptz('trial_ends_at'),
    couponId: uuid('coupon_id').references(() => coupons.id),
    couponEndsAt: timestamptz('coupon_ends_at'),
    currentPeriodStart: timestamptz('current_period_start').notNull(),
    currentPeriodEnd: timestamptz('current_period_end').notNull(),
    isCancellationScheduled: boolean('is_cancellation_scheduled').notNull().default(false),
    pendingPlanId: uuid('pending_plan_id').references(() => plans.id),
    renewalMethod: text('renewal_method', { enum: renewalMethods }).notNull().default('pay_link'),
    bkashAgreementCiphertext: bytea('bkash_agreement_ciphertext'),
    bkashAgreementKeyVersion: smallint('bkash_agreement_key_version'),
    pastDueSince: timestamptz('past_due_since'),
    renewalAttempts: smallint('renewal_attempts').notNull().default(0),
    nextRenewalAttemptAt: timestamptz('next_renewal_attempt_at'),
    readOnlySince: timestamptz('read_only_since'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('subscriptions_store_id_key').on(table.storeId),
    uniqueIndex('subscriptions_store_id_id_key').on(table.storeId, table.id),
    check(
      'subscriptions_price_change',
      sql`(${table.pendingPricePoisha} is null) = (${table.priceChangeStartsAt} is null) and coalesce(${table.pendingPricePoisha}, 0) >= 0`,
    ),
    index('subscriptions_coupon_id_idx').on(table.couponId),
    index('subscriptions_plan_id_idx').on(table.planId),
    index('subscriptions_pending_plan_id_idx').on(table.pendingPlanId),
    index('subscriptions_renewal_due_idx')
      .on(table.nextRenewalAttemptAt)
      .where(sql`${table.nextRenewalAttemptAt} is not null`),
    index('subscriptions_trial_ends_at_idx')
      .on(table.trialEndsAt)
      .where(sql`${table.status} = 'trialing'`),
    check('subscriptions_billing_cycle', isOneOf(table.billingCycle, billingCycles)),
    check('subscriptions_status', isOneOf(table.status, subscriptionStatuses)),
    check('subscriptions_renewal_method', isOneOf(table.renewalMethod, renewalMethods)),
  ],
);

// Add-ons bought on top of the plan (Chats AI tiers). Each renews with the subscription at its
// own agreed price; a price change follows the same 30-day notice (ADM-R10).
export const subscriptionItems = pgTable(
  'subscription_items',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: text('status', { enum: subscriptionItemStatuses }).notNull().default('active'),
    currentPeriodPricePoisha: poisha('current_period_price_poisha').notNull(),
    pendingPricePoisha: poisha('pending_price_poisha'),
    priceChangeStartsAt: timestamptz('price_change_starts_at'),
    startedAt: timestamptz('started_at').notNull(),
    cancelledAt: timestamptz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'subscription_items_subscription_id_store_fk',
      columns: [table.storeId, table.subscriptionId],
      foreignColumns: [subscriptions.storeId, subscriptions.id] as [AnyPgColumn, AnyPgColumn],
    }),
    uniqueIndex('subscription_items_active_key')
      .on(table.subscriptionId, table.planId)
      .where(sql`${table.status} = 'active'`),
    index('subscription_items_store_id_idx').on(table.storeId),
    index('subscription_items_plan_id_idx').on(table.planId),
    check('subscription_items_status', isOneOf(table.status, subscriptionItemStatuses)),
    check(
      'subscription_items_price_change',
      sql`(${table.pendingPricePoisha} is null) = (${table.priceChangeStartsAt} is null)`,
    ),
    check(
      'subscription_items_prices',
      sql`${table.currentPeriodPricePoisha} >= 0 and coalesce(${table.pendingPricePoisha}, 0) >= 0`,
    ),
  ],
);

// Mushak-6.3 VAT invoices for Dakly's own billing. Issued once and never edited; a correction is
// a credit note. Lines are part of the issued document and never queried alone.
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    number: text('number').notNull(),
    financialYear: text('financial_year').notNull(),
    kind: text('kind', { enum: invoiceKinds }).notNull().default('invoice'),
    creditedInvoiceId: uuid('credited_invoice_id').references((): AnyPgColumn => invoices.id),
    lines: jsonb('lines').notNull(),
    billTo: jsonb('bill_to').notNull(),
    subtotalPoisha: poisha('subtotal_poisha').notNull(),
    // VAT rate in basis points (1500 = 15%), copied from platform settings at issue time.
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull(),
    vatPoisha: poisha('vat_poisha').notNull(),
    totalPoisha: poisha('total_poisha').notNull(),
    couponId: uuid('coupon_id').references(() => coupons.id),
    status: text('status', { enum: invoiceStatuses }).notNull().default('open'),
    issuedAt: timestamptz('issued_at').notNull().defaultNow(),
    paidAt: timestamptz('paid_at'),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('invoices_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'invoices_credits_invoice_id_store_fk',
      columns: [table.storeId, table.creditedInvoiceId],
      foreignColumns: [invoices.storeId, invoices.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('invoices_number_key').on(table.number),
    index('invoices_store_id_issued_at_idx').on(table.storeId, table.issuedAt),
    index('invoices_credited_invoice_id_idx').on(table.creditedInvoiceId),
    index('invoices_coupon_id_idx').on(table.couponId),
    check('invoices_kind', isOneOf(table.kind, invoiceKinds)),
    check('invoices_status', isOneOf(table.status, invoiceStatuses)),
    check(
      'invoices_credit_note',
      sql`(${table.kind} = 'credit_note') = (${table.creditedInvoiceId} is not null)`,
    ),
    check(
      'invoices_total',
      sql`${table.totalPoisha} = ${table.subtotalPoisha} + ${table.vatPoisha}`,
    ),
  ],
);

// Global counter per financial year (July to June) for invoice numbers (PAY-R17).
export const invoiceCounters = pgTable('invoice_counters', {
  financialYear: text('financial_year').primaryKey(),
  nextNumber: integer('next_number').notNull().default(1),
});

// Append-only prepaid ledger. Under an advisory lock on (store, wallet), writers read the
// greatest revision and append its successor. Balance order follows revision, never created_at.
export const walletLedger = pgTable(
  'wallet_ledger',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    wallet: text('wallet', { enum: wallets }).notNull(),
    revision: integer('revision').notNull(),
    kind: text('kind', { enum: walletEntryKinds }).notNull(),
    // Units follow the wallet: poisha for whatsapp_poisha, a count for the others. Never sum
    // rows of different wallets.
    quantityDelta: bigint('quantity_delta', { mode: 'number' }).notNull(),
    balanceQuantityAfter: bigint('balance_quantity_after', { mode: 'number' }).notNull(),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    actorType: text('actor_type', { enum: actorTypes }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorStaffId: uuid('actor_staff_id').references(() => staffUsers.id),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('wallet_ledger_store_id_idempotency_key_key').on(
      table.storeId,
      table.idempotencyKey,
    ),
    uniqueIndex('wallet_ledger_store_id_wallet_revision_key').on(
      table.storeId,
      table.wallet,
      table.revision,
    ),
    index('wallet_ledger_actor_user_id_idx').on(table.actorUserId),
    index('wallet_ledger_actor_staff_id_idx').on(table.actorStaffId),
    check('wallet_ledger_wallet', isOneOf(table.wallet, wallets)),
    check('wallet_ledger_kind', isOneOf(table.kind, walletEntryKinds)),
    check('wallet_ledger_actor_type', isOneOf(table.actorType, actorTypes)),
    check('wallet_ledger_quantity', sql`${table.quantityDelta} <> 0`),
    check('wallet_ledger_balance', sql`${table.balanceQuantityAfter} >= 0`),
    check('wallet_ledger_revision', sql`${table.revision} > 0`),
  ],
);

// Plan allowance use, unique on reference so a retried job never charges twice. Usage in a
// period is a SUM over (store, unit, period_start); no running total table.
export const usageEvents = pgTable(
  'usage_events',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    unit: text('unit', { enum: usageUnits }).notNull(),
    quantity: integer('quantity').notNull(),
    source: text('source', { enum: usageSources }).notNull(),
    reference: text('reference').notNull(),
    periodStart: date('period_start').notNull(),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('usage_events_reference_key').on(table.storeId, table.unit, table.reference),
    index('usage_events_period_idx').on(table.storeId, table.unit, table.periodStart),
    check('usage_events_unit', isOneOf(table.unit, usageUnits)),
    check('usage_events_source', isOneOf(table.source, usageSources)),
    check('usage_events_quantity', sql`${table.quantity} > 0`),
  ],
);
