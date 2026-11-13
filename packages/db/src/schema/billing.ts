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
  invoiceKinds,
  invoiceStatuses,
  renewalMethods,
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
    name: text('name').notNull(),
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
    // Percent (1 to 100) or an amount in poisha, depending on kind.
    value: integer('value').notNull(),
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
    check(
      'coupons_value',
      sql`${table.value} > 0 and (${table.kind} <> 'percent' or ${table.value} <= 100)`,
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
    // Price at the time of the last renewal; price changes need 30 days' notice (ADM-R10).
    pricePoisha: poisha('price_poisha').notNull(),
    trialEndsAt: timestamptz('trial_ends_at'),
    currentPeriodStart: timestamptz('current_period_start').notNull(),
    currentPeriodEnd: timestamptz('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
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
    creditsInvoiceId: uuid('credits_invoice_id').references((): AnyPgColumn => invoices.id),
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
      columns: [table.storeId, table.creditsInvoiceId],
      foreignColumns: [invoices.storeId, invoices.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('invoices_number_key').on(table.number),
    index('invoices_store_id_issued_at_idx').on(table.storeId, table.issuedAt),
    index('invoices_credits_invoice_id_idx').on(table.creditsInvoiceId),
    index('invoices_coupon_id_idx').on(table.couponId),
    check('invoices_kind', isOneOf(table.kind, invoiceKinds)),
    check('invoices_status', isOneOf(table.status, invoiceStatuses)),
    check(
      'invoices_credit_note',
      sql`(${table.kind} = 'credit_note') = (${table.creditsInvoiceId} is not null)`,
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
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
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
    check('wallet_ledger_amount', sql`${table.amount} <> 0`),
    check('wallet_ledger_balance', sql`${table.balanceAfter} >= 0`),
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
