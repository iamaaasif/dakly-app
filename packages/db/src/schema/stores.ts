import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  customerListSizes,
  extensions,
  howYouSellOptions,
  storeOfferings,
  storeStatuses,
} from '@dakly/contracts/stores';

import { allOneOf, citext, createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';

// The tenant. Settings the database never filters on (working hours, quiet hours, daily limits,
// payment rules) live in settings, validated by one zod schema per section.
export const stores = pgTable(
  'stores',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug'),
    legalName: text('legal_name'),
    businessType: text('business_type'),
    phone: text('phone'),
    email: citext('email'),
    // Website or Facebook Page link from sign-up, and whether the business sells products, services or both.
    websiteUrl: text('website_url'),
    offering: text('offering'),
    address: text('address'),
    district: text('district'),
    vatBin: text('vat_bin'),
    tradeLicenceNumber: text('trade_licence_number'),
    logoObjectKey: text('logo_object_key'),
    timeZone: text('time_zone').notNull().default('Asia/Dhaka'),
    howYouSell: text('how_you_sell')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Self-reported at sign-up for the plan suggestion, never the live customer count.
    onboardingCustomerCountRange: text('onboarding_customer_count_range'),
    extensions: text('extensions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Days without an order before a customer counts as inactive (glossary).
    customerInactivityDays: smallint('customer_inactivity_days').notNull().default(60),
    attributionWindowDays: smallint('attribution_window_days').notNull().default(7),
    settings: jsonb('settings').notNull().default({}),
    status: text('status', { enum: storeStatuses }).notNull().default('active'),
    suspendedReason: text('suspended_reason'),
    deleteAfter: timestamptz('delete_after'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('stores_slug_key').on(table.slug),
    check('stores_name_length', sql`char_length(${table.name}) between 1 and 100`),
    check('stores_slug_format', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{2,39}$'`),
    check('stores_vat_bin_format', sql`${table.vatBin} ~ '^[0-9]{13}$'`),
    check('stores_how_you_sell', allOneOf(table.howYouSell, howYouSellOptions)),
    check(
      'stores_onboarding_customer_count_range',
      isOneOf(table.onboardingCustomerCountRange, customerListSizes),
    ),
    check('stores_extensions', allOneOf(table.extensions, extensions)),
    check('stores_offering', isOneOf(table.offering, storeOfferings)),
    check(
      'stores_customer_inactivity_days',
      sql`${table.customerInactivityDays} between 30 and 180`,
    ),
    check('stores_attribution_window_days', sql`${table.attributionWindowDays} in (1, 3, 7)`),
    check('stores_status', isOneOf(table.status, storeStatuses)),
  ],
);

// Its own row so taking the next order number never waits on a settings save.
export const storeCounters = pgTable(
  'store_counters',
  {
    storeId: uuid('store_id')
      .primaryKey()
      .references(() => stores.id),
    nextOrderNumber: integer('next_order_number').notNull().default(1001),
  },
  (table) => [check('store_counters_next_order_number', sql`${table.nextOrderNumber} > 0`)],
);
