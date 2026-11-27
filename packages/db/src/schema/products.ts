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

import type { ProductBulkEditChange } from '@dakly/contracts/product-bulk-edits';
import { productStockStatuses } from '@dakly/contracts/product-editor-fields';
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

// A store's own two-level category list. A product has one category; a parent has no parent.
export const productCategories = pgTable(
  'product_categories',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('product_categories_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'product_categories_parent_id_store_fk',
      columns: [table.storeId, table.parentId],
      foreignColumns: [table.storeId, table.id],
    }),
    uniqueIndex('product_categories_top_name_key')
      .on(table.storeId, sql`lower(${table.name})`)
      .where(sql`${table.parentId} is null`),
    uniqueIndex('product_categories_child_name_key')
      .on(table.storeId, table.parentId, sql`lower(${table.name})`)
      .where(sql`${table.parentId} is not null`),
    check('product_categories_name_length', sql`char_length(${table.name}) between 1 and 100`),
  ],
);

export const productBrands = pgTable(
  'product_brands',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('product_brands_store_id_id_key').on(table.storeId, table.id),
    uniqueIndex('product_brands_store_name_key').on(table.storeId, sql`lower(${table.name})`),
    check('product_brands_name_length', sql`char_length(${table.name}) between 1 and 100`),
  ],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    description: text('description'),
    shortDescription: text('short_description'),
    barcode: text('barcode'),
    categoryId: uuid('category_id'),
    brandId: uuid('brand_id'),
    // Packed parcel weight in grams for courier charges; null means the seller has not set one.
    weightGrams: integer('weight_grams'),
    // Words customers use for it ("kurti", "কুর্তি", "three piece"), for AI search.
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // The effective price of every size whose variant has no override. 0 means "Needs a price"
    // (PROD-R1): such a product is not offered in chats, shop sales or the order link.
    pricePoisha: poisha('price_poisha').notNull().default(0),
    compareAtPricePoisha: poisha('compare_at_price_poisha'),
    negotiationEnabled: boolean('negotiation_enabled').notNull().default(false),
    negotiationOpeningPoisha: poisha('negotiation_opening_poisha'),
    negotiationFloorPoisha: poisha('negotiation_floor_poisha'),
    imageFileIds: uuid('image_file_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // Up to three option types and their values, for example Size: S, M, L.
    options: jsonb('options').notNull().default([]),
    isStockTracked: boolean('is_stock_tracked').notNull().default(true),
    // Read only when stock is not tracked.
    stockStatus: text('stock_status', { enum: productStockStatuses }).notNull().default('in_stock'),
    // Staff may put the product on a manual order with no stock; chats and the order link never do.
    allowOrdersWhenOutOfStock: boolean('allow_orders_when_out_of_stock').notNull().default(false),
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
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('products_store_id_id_key').on(table.storeId, table.id),

    index('products_store_id_status_idx').on(table.storeId, table.status, table.name),
    foreignKey({
      name: 'products_category_id_store_fk',
      columns: [table.storeId, table.categoryId],
      foreignColumns: [productCategories.storeId, productCategories.id],
    }),
    foreignKey({
      name: 'products_brand_id_store_fk',
      columns: [table.storeId, table.brandId],
      foreignColumns: [productBrands.storeId, productBrands.id],
    }),
    index('products_store_category_id_idx').on(table.storeId, table.categoryId),
    index('products_store_brand_id_idx').on(table.storeId, table.brandId),
    index('products_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`),
    index('products_aliases_idx').using('gin', table.aliases),
    uniqueIndex('products_store_id_external_ref_key')
      .on(table.storeId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    check('products_status', isOneOf(table.status, productStatuses)),
    check('products_stock_status', isOneOf(table.stockStatus, productStockStatuses)),
    check(
      'products_short_description_length',
      sql`${table.shortDescription} is null or char_length(${table.shortDescription}) <= 300`,
    ),
    check(
      'products_barcode_length',
      sql`${table.barcode} is null or char_length(${table.barcode}) <= 64`,
    ),
    check(
      'products_negotiation_price_order',
      sql`${table.negotiationFloorPoisha} <= ${table.negotiationOpeningPoisha}`,
    ),
    check(
      'products_price',
      sql`${table.pricePoisha} >= 0 and coalesce(${table.compareAtPricePoisha}, 0) >= 0`,
    ),
    check(
      'products_weight_grams',
      sql`${table.weightGrams} is null or ${table.weightGrams} between 1 and 100000`,
    ),
    check('products_name_length', sql`char_length(${table.name}) between 1 and 200`),
  ],
);

export const priceOffers = pgTable(
  'price_offers',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    conversationId: uuid('conversation_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    productId: uuid('product_id').notNull(),
    // The turn remains used even when older chat messages move to an archive.
    customerMessageId: uuid('customer_message_id').notNull(),
    offeredPricePoisha: poisha('offered_price_poisha').notNull(),
    step: text('step', { enum: ['opening', 'final'] }).notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'price_offers_conversation_store_fk',
      columns: [table.storeId, table.conversationId],
      foreignColumns: [conversations.storeId, conversations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'price_offers_contact_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'price_offers_product_store_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('cascade'),
    uniqueIndex('price_offers_customer_turn_key').on(
      table.storeId,
      table.conversationId,
      table.productId,
      table.customerMessageId,
    ),
    index('price_offers_scope_expiry_idx').on(
      table.storeId,
      table.conversationId,
      table.contactId,
      table.productId,
      table.expiresAt,
    ),
    index('price_offers_contact_idx').on(table.storeId, table.contactId),
    index('price_offers_product_idx').on(table.storeId, table.productId),
    check('price_offers_step', isOneOf(table.step, ['opening', 'final'])),
    check('price_offers_nonnegative_price', sql`${table.offeredPricePoisha} >= 0`),
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
    // Optional photos of this variant only; with none, the product's photos are shown.
    imageFileIds: uuid('image_file_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
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

// One bulk edit on the products list. Kept for 24 hours so the owner can undo it; the changes
// hold the old and new value of every field, and stock is undone with a new movement.
export const productBulkEdits = pgTable(
  'product_bulk_edits',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    changes: jsonb('changes').$type<ProductBulkEditChange[]>().notNull(),
    stockReason: text('stock_reason'),
    createdAt: createdAt(),
    undoUntil: timestamptz('undo_until').notNull(),
    undoneAt: timestamptz('undone_at'),
  },
  (table) => [
    index('product_bulk_edits_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('product_bulk_edits_actor_user_id_idx').on(table.actorUserId),
  ],
);
