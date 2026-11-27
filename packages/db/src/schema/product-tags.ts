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

// A shop's tag list. A product's tags are rows in product_tag_links.
export const productTags = pgTable(
  'product_tags',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('product_tags_store_id_id_key').on(table.storeId, table.id),
    uniqueIndex('product_tags_store_name_key').on(table.storeId, sql`lower(${table.name})`),
    check('product_tags_name_length', sql`char_length(${table.name}) between 1 and 50`),
  ],
);

export const productTagLinks = pgTable(
  'product_tag_links',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    productId: uuid('product_id').notNull(),
    tagId: uuid('tag_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.tagId] }),
    foreignKey({
      name: 'product_tag_links_product_store_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_tag_links_tag_store_fk',
      columns: [table.storeId, table.tagId],
      foreignColumns: [productTags.storeId, productTags.id],
    }).onDelete('cascade'),
    index('product_tag_links_tag_idx').on(table.storeId, table.tagId),
  ],
);
