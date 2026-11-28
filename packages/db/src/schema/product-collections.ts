import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns';
import { products } from './products';
import { stores } from './stores';

// A shop's named groups of products, such as "Eid 2026". A product's groups are rows in
// product_collection_links.
export const productCollections = pgTable(
  'product_collections',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('product_collections_store_id_id_key').on(table.storeId, table.id),
    uniqueIndex('product_collections_store_name_key').on(table.storeId, sql`lower(${table.name})`),
    check('product_collections_name_length', sql`char_length(${table.name}) between 1 and 60`),
  ],
);

export const productCollectionLinks = pgTable(
  'product_collection_links',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    productId: uuid('product_id').notNull(),
    collectionId: uuid('collection_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.collectionId] }),
    foreignKey({
      name: 'product_collection_links_product_store_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_collection_links_collection_store_fk',
      columns: [table.storeId, table.collectionId],
      foreignColumns: [productCollections.storeId, productCollections.id],
    }).onDelete('cascade'),
    index('product_collection_links_collection_idx').on(table.storeId, table.collectionId),
  ],
);
