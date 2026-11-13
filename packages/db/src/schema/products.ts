import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import {
  productStatuses,
  restockRequestStatuses,
  stockMovementKinds,
} from '@dakly/contracts/products';
import { users } from './auth';
import { conversations } from './chats';
import { createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { stores } from './stores';

export const products = pgTable(
  'products',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    // Words customers use for it ("kurti", "কুর্তি", "three piece"), for AI search.
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // The effective price of every size whose variant has no override. 0 means "Needs a price"
    // (PROD-R1): such a product is not offered in chats, shop sales or the order link.
    pricePoisha: poisha('price_poisha').notNull().default(0),
    compareAtPricePoisha: poisha('compare_at_price_poisha'),
    imageFileIds: uuid('image_file_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // Up to three option types and their values, for example Size: S, M, L.
    options: jsonb('options').notNull().default([]),
    isStockTracked: boolean('is_stock_tracked').notNull().default(true),
    isVisibleInChats: boolean('is_visible_in_chats').notNull().default(true),
    isVisibleInOrderLink: boolean('is_visible_in_order_link').notNull().default(true),
    status: text('status', { enum: productStatuses }).notNull().default('active'),
    askCount: integer('ask_count').notNull().default(0),
    searchEmbedding: vector('search_embedding', { dimensions: 512 }),
    // The main photo, described by the vision tier and embedded with the same model as the text,
    // so a customer's photo is matched in the same space (products have no image model of their own).
    imageEmbedding: vector('image_embedding', { dimensions: 512 }),
    // Both embeddings are rebuilt when this differs from the configured embed model.
    embeddingModel: text('embedding_model'),
    // Hash of the text the embedding was built from; a change queues a rebuild.
    searchTextHash: text('search_text_hash'),
    externalRef: text('external_ref'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('products_store_id_id_key').on(table.storeId, table.id),

    index('products_store_id_status_idx').on(table.storeId, table.status, table.name),
    index('products_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`),
    index('products_aliases_idx').using('gin', table.aliases),
    uniqueIndex('products_store_id_external_ref_key')
      .on(table.storeId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    check('products_status', isOneOf(table.status, productStatuses)),
    check(
      'products_price',
      sql`${table.pricePoisha} >= 0 and coalesce(${table.compareAtPricePoisha}, 0) >= 0`,
    ),
    check('products_name_length', sql`char_length(${table.name}) between 1 and 200`),
  ],
);

// An order always points at a variant; a product with no options has one default variant.
// Available = on_hand - reserved. Changed only by ProductsService.moveStock with a guarded update.
export const productVariants = pgTable(
  'product_variants',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    title: text('title').notNull(),
    optionValues: jsonb('option_values').notNull().default({}),
    sku: text('sku'),
    // Null uses the product's price_poisha; a value replaces it for this size only.
    priceOverridePoisha: poisha('price_override_poisha'),
    costPoisha: poisha('cost_poisha'),
    onHand: integer('on_hand').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold'),
    isDefault: boolean('is_default').notNull().default(false),
    position: smallint('position').notNull().default(0),
    status: text('status', { enum: productStatuses }).notNull().default('active'),
    externalSource: text('external_source'),
    externalAccountId: text('external_account_id'),
    externalRef: text('external_ref'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('product_variants_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'product_variants_product_id_store_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id] as [AnyPgColumn, AnyPgColumn],
    }),

    index('product_variants_product_id_idx').on(table.productId),
    index('product_variants_store_id_idx').on(table.storeId),
    uniqueIndex('product_variants_store_id_sku_key')
      .on(table.storeId, table.sku)
      .where(sql`${table.sku} is not null`),
    uniqueIndex('product_variants_external_identity_key')
      .on(table.storeId, table.externalSource, table.externalAccountId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    check(
      'product_variants_external_identity',
      sql`(${table.externalRef} is null and ${table.externalSource} is null and ${table.externalAccountId} is null)
        or (${table.externalRef} is not null and ${table.externalSource} is not null and ${table.externalAccountId} is not null)`,
    ),
    uniqueIndex('product_variants_one_default_key')
      .on(table.productId)
      .where(sql`${table.isDefault}`),
    check('product_variants_status', isOneOf(table.status, productStatuses)),
    check('product_variants_reserved', sql`${table.reserved} >= 0`),
    check(
      'product_variants_money',
      sql`coalesce(${table.priceOverridePoisha}, 1) > 0 and coalesce(${table.costPoisha}, 0) >= 0`,
    ),
  ],
);

// Append-only stock ledger: every change says why. Quantity is signed for on_hand changes.
// order_id has no foreign key because orders already depend on products.
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    kind: text('kind', { enum: stockMovementKinds }).notNull(),
    quantity: integer('quantity').notNull(),
    onHandAfter: integer('on_hand_after').notNull(),
    reservedAfter: integer('reserved_after').notNull(),
    orderId: uuid('order_id'),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'stock_movements_variant_id_store_fk',
      columns: [table.storeId, table.variantId],
      foreignColumns: [productVariants.storeId, productVariants.id] as [AnyPgColumn, AnyPgColumn],
    }),

    index('stock_movements_variant_idx').on(table.storeId, table.variantId, table.createdAt),
    index('stock_movements_variant_id_idx').on(table.variantId),
    index('stock_movements_store_id_order_id_idx')
      .on(table.storeId, table.orderId)
      .where(sql`${table.orderId} is not null`),
    index('stock_movements_actor_user_id_idx').on(table.actorUserId),
    check('stock_movements_kind', isOneOf(table.kind, stockMovementKinds)),
    check('stock_movements_quantity', sql`${table.quantity} <> 0`),
  ],
);

// The "tell me when it is back" list. Needed by the back-in-stock template (D23) and the AI
// tool add_to_restock_list. Sending is never automatic; the owner is prompted.
export const restockRequests = pgTable(
  'restock_requests',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: restockRequestStatuses }).notNull().default('waiting'),
    notifiedAt: timestamptz('notified_at'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'restock_requests_variant_id_store_fk',
      columns: [table.storeId, table.variantId],
      foreignColumns: [productVariants.storeId, productVariants.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'restock_requests_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'restock_requests_conversation_id_store_fk',
      columns: [table.storeId, table.conversationId],
      foreignColumns: [conversations.storeId, conversations.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('restock_requests_waiting_key')
      .on(table.variantId, table.contactId)
      .where(sql`${table.status} = 'waiting'`),
    index('restock_requests_store_id_variant_idx').on(table.storeId, table.variantId, table.status),
    index('restock_requests_variant_id_idx').on(table.variantId),
    index('restock_requests_contact_id_idx').on(table.contactId),
    index('restock_requests_conversation_id_idx').on(table.conversationId),
    check('restock_requests_status', isOneOf(table.status, restockRequestStatuses)),
  ],
);
