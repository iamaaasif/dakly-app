import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { adLinkSources, adReadStates, adSuggestionOrigins } from '@dakly/contracts/ad-links';

import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { products } from './products';
import { stores } from './stores';

// Which products a Meta ad or post sells. A chat that starts from it is answered from these only.
export const adProductLinks = pgTable(
  'ad_product_links',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    source: text('source', { enum: adLinkSources }).notNull(),
    // Meta's ad id or post id, kept as the text Meta sends.
    externalId: text('external_id').notNull(),
    productId: uuid('product_id').notNull(),
    position: smallint('position').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('ad_product_links_source_product_key').on(
      table.storeId,
      table.source,
      table.externalId,
      table.productId,
    ),
    foreignKey({
      name: 'ad_product_links_product_id_store_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id] as [AnyPgColumn, AnyPgColumn],
    }),
    check('ad_product_links_source', isOneOf(table.source, adLinkSources)),
    check('ad_product_links_position', sql`${table.position} between 0 and 3`),
  ],
);

// An ad or post a customer came from, with what Meta showed of it. Read once to suggest products.
export const adSources = pgTable(
  'ad_sources',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    source: text('source', { enum: adLinkSources }).notNull(),
    externalId: text('external_id').notNull(),
    title: text('title'),
    photoUrl: text('photo_url'),
    readState: text('read_state', { enum: adReadStates }).notNull().default('pending'),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ad_sources_source_key').on(table.storeId, table.source, table.externalId),
    check('ad_sources_source', isOneOf(table.source, adLinkSources)),
    check('ad_sources_read_state', isOneOf(table.readState, adReadStates)),
  ],
);

// Products Dakly thinks an ad shows. The AI never reads these; only the owner's confirmed link counts.
export const adProductSuggestions = pgTable(
  'ad_product_suggestions',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    source: text('source', { enum: adLinkSources }).notNull(),
    externalId: text('external_id').notNull(),
    productId: uuid('product_id').notNull(),
    origin: text('origin', { enum: adSuggestionOrigins }).notNull(),
    position: smallint('position').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('ad_product_suggestions_source_product_key').on(
      table.storeId,
      table.source,
      table.externalId,
      table.productId,
    ),
    foreignKey({
      name: 'ad_product_suggestions_product_id_store_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id] as [AnyPgColumn, AnyPgColumn],
    }),
    check('ad_product_suggestions_source', isOneOf(table.source, adLinkSources)),
    check('ad_product_suggestions_origin', isOneOf(table.origin, adSuggestionOrigins)),
    check('ad_product_suggestions_position', sql`${table.position} between 0 and 3`),
  ],
);
