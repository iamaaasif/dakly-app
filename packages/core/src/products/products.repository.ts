import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, getTableName, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';

import type {
  CreateProductInput,
  ProductListQuery,
  ProductOption,
  StockMovementKind,
  ConfirmProductPhotoInput,
} from '@dakly/contracts/products';
import { MAX_STOCK_QUANTITY } from '@dakly/contracts/products';
import { files } from '@dakly/db/schema/platform';
import { products, productVariants, stockMovements } from '@dakly/db/schema/products';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

// Drizzle strips qualifiers in SELECT expressions; this must refer to the outer product.
const productIdColumn = sql`${sql.identifier(getTableName(products))}.${sql.identifier(products.id.name)}`;
const productImagesColumn = sql`${sql.identifier(getTableName(products))}.${sql.identifier(products.imageFileIds.name)}`;

const productColumns = {
  id: products.id,
  name: products.name,
  description: products.description,
  category: products.category,
  aliases: products.aliases,
  pricePoisha: products.pricePoisha,
  compareAtPricePoisha: products.compareAtPricePoisha,
  options: sql<ProductOption[]>`${products.options}`,
  imageFileIds: products.imageFileIds,
  isStockTracked: products.isStockTracked,
  isVisibleInChats: products.isVisibleInChats,
  isVisibleInOrderLink: products.isVisibleInOrderLink,
  status: sql<'active' | 'hidden'>`${products.status}`,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};
const variantColumns = {
  id: productVariants.id,
  productId: productVariants.productId,
  title: productVariants.title,
  optionValues: sql<Record<string, string>>`${productVariants.optionValues}`,
  sku: productVariants.sku,
  priceOverridePoisha: productVariants.priceOverridePoisha,
  costPoisha: productVariants.costPoisha,
  onHand: productVariants.onHand,
  reserved: productVariants.reserved,
  isDefault: productVariants.isDefault,
};
export type CatalogueProduct = Product & {
  variants: Variant[];
  photos: { id: string; objectKey: string }[];
};
type PhotoWrite = ConfirmProductPhotoInput & {
  objectKey: string;
  uploadedByUserId: string | null;
  createdAt: Date;
};

type ProductDetails = Omit<CreateProductInput, 'variants'>;
export type Product = ProductDetails & {
  id: string;
  imageFileIds: string[];
  createdAt: Date;
  updatedAt: Date;
};
export type Variant = CreateProductInput['variants'][number] & {
  id: string;
  productId: string;
  title: string;
  isDefault: boolean;
  onHand: number;
  reserved: number;
};
type VariantWrite = Omit<Variant, 'id' | 'productId' | 'onHand' | 'reserved'> & {
  id?: string;
  position: number;
};

type StockDelta = { onHandDelta: number; reservedDelta: number };
type StockMovementWrite = {
  variantId: string;
  kind: StockMovementKind;
  quantity: number;
  onHandAfter: number;
  reservedAfter: number;
  orderId: string | null;
  reason: string | null;
  actorUserId: string | null;
  createdAt: Date;
};

@Injectable()
export class ProductsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findById(storeId: string, id: string): Promise<CatalogueProduct | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...productColumns,
          variants: variantSnapshot(storeId),
          photos: photoSnapshot(storeId),
        })
        .from(products)
        .where(
          and(eq(products.storeId, storeId), eq(products.id, id), ne(products.status, 'archived')),
        ),
    );
    return rows[0];
  }

  list(
    storeId: string,
    query: ProductListQuery,
    lowStockThreshold: number,
  ): Promise<CatalogueProduct[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...productColumns,
          variants: variantSnapshot(storeId),
          photos: photoSnapshot(storeId),
        })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            ne(products.status, 'archived'),
            query.search
              ? sql`${products.name} ilike ${`%${query.search.replace(/[\\%_]/g, '\\$&')}%`}`
              : undefined,
            query.readiness === 'hidden' ? eq(products.status, 'hidden') : undefined,
            query.readiness === 'needs_photo'
              ? sql`cardinality(${products.imageFileIds}) = 0`
              : undefined,
            query.readiness === 'needs_price'
              ? sql`exists (select 1 from product_variants v where v.store_id = ${storeId} and v.product_id = ${productIdColumn} and v.status <> 'archived' and coalesce(v.price_override_poisha, ${products.pricePoisha}) = 0)`
              : undefined,
            query.readiness === 'running_low'
              ? sql`${products.isStockTracked} and exists (select 1 from product_variants v where v.store_id = ${storeId} and v.product_id = ${productIdColumn} and v.status <> 'archived' and v.on_hand - v.reserved <= ${lowStockThreshold})`
              : undefined,
            query.cursor ? lt(products.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(products.id))
        .limit(query.limit + 1),
    );
  }

  async listCategories(storeId: string): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinct({ category: products.category })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            isNotNull(products.category),
            ne(products.status, 'archived'),
          ),
        )
        .orderBy(asc(products.category))
        .limit(200),
    );
    return rows.map((row) => row.category!);
  }

  findVariants(storeId: string, productIds: string[]): Promise<Variant[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(variantColumns)
        .from(productVariants)
        .where(
          and(
            eq(productVariants.storeId, storeId),
            inArray(productVariants.productId, productIds),
            ne(productVariants.status, 'archived'),
          ),
        )
        .orderBy(productVariants.position, productVariants.id),
    );
  }

  async insert(storeId: string, input: ProductDetails, now: Date): Promise<Product> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(products)
        .values({ storeId, ...input, createdAt: now, updatedAt: now })
        .returning(productColumns),
    );
    return rows[0]!;
  }

  async update(
    storeId: string,
    id: string,
    input: Partial<ProductDetails>,
    now: Date,
  ): Promise<Product | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(products)
        .set({ ...input, updatedAt: now })
        .where(
          and(eq(products.storeId, storeId), eq(products.id, id), ne(products.status, 'archived')),
        )
        .returning(productColumns),
    );
    return rows[0];
  }

  async saveVariants(
    storeId: string,
    productId: string,
    variants: VariantWrite[],
    now: Date,
  ): Promise<boolean> {
    try {
      await this.database.forStore(storeId, async (tx) => {
        const forProduct = and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
        );
        // Order operations lock the same rows in ID order.
        await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(forProduct)
          .orderBy(productVariants.id)
          .for('no key update');
        await tx
          .update(productVariants)
          .set({ status: 'archived', isDefault: false, updatedAt: now })
          .where(forProduct);
        await tx
          .insert(productVariants)
          .values(
            variants.map((variant) => ({
              ...variant,
              storeId,
              productId,
              status: 'active' as const,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: productVariants.id,
            set: {
              title: sql`excluded.title`,
              optionValues: sql`excluded.option_values`,
              sku: sql`excluded.sku`,
              priceOverridePoisha: sql`excluded.price_override_poisha`,
              costPoisha: sql`excluded.cost_poisha`,
              isDefault: sql`excluded.is_default`,
              position: sql`excluded.position`,
              status: 'active',
              updatedAt: now,
            },
            setWhere: and(
              eq(productVariants.storeId, storeId),
              eq(productVariants.productId, productId),
            ),
          });
      });
      return true;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'product_variants_store_id_sku_key')) return false;
      throw error;
    }
  }

  async findStockVariant(
    storeId: string,
    variantId: string,
  ): Promise<{ isStockTracked: boolean } | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ isStockTracked: products.isStockTracked })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(products.storeId, storeId),
            eq(productVariants.id, variantId),
          ),
        ),
    );
    return rows[0];
  }

  async changeStock(
    storeId: string,
    variantId: string,
    change: StockDelta,
    now: Date,
  ): Promise<{ onHand: number; reserved: number } | undefined> {
    const onHand = sql`${productVariants.onHand}::bigint + ${change.onHandDelta}`;
    const reserved = sql`${productVariants.reserved}::bigint + ${change.reservedDelta}`;
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(productVariants)
        .set({ onHand, reserved, updatedAt: now })
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.id, variantId),
            sql`${onHand} >= ${reserved} and ${reserved} >= 0 and ${onHand} <= ${MAX_STOCK_QUANTITY} and ${reserved} <= ${MAX_STOCK_QUANTITY}`,
          ),
        )
        .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved }),
    );
    return rows[0];
  }

  async insertStockMovement(storeId: string, movement: StockMovementWrite): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(stockMovements).values({ storeId, ...movement }),
    );
  }

  async archive(storeId: string, id: string, now: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(products)
        .set({ status: 'archived', updatedAt: now })
        .where(
          and(eq(products.storeId, storeId), eq(products.id, id), ne(products.status, 'archived')),
        )
        .returning({ id: products.id }),
    );
    return rows.length > 0;
  }

  async insertPhoto(storeId: string, { fileId, ...input }: PhotoWrite): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(files)
        .values({ ...input, id: fileId, storeId, purpose: 'product_image', status: 'ready' })
        .onConflictDoNothing()
        .returning({ id: files.id }),
    );
    return rows.length > 0;
  }

  async updatePhotos(
    storeId: string,
    id: string,
    imageFileIds: string[],
    now: Date,
  ): Promise<{ id: string } | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(products)
        .set({ imageFileIds, updatedAt: now })
        .where(
          and(eq(products.storeId, storeId), eq(products.id, id), ne(products.status, 'archived')),
        )
        .returning({ id: products.id }),
    );
    return rows[0];
  }

  async expirePhoto(storeId: string, fileId: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(files)
        .set({ expiresAt: now })
        .where(
          and(eq(files.storeId, storeId), eq(files.id, fileId), eq(files.purpose, 'product_image')),
        ),
    );
  }
}

function variantSnapshot(storeId: string) {
  return sql<Variant[]>`(select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'productId', v.product_id, 'title', v.title, 'optionValues', v.option_values,
    'sku', v.sku, 'priceOverridePoisha', v.price_override_poisha, 'costPoisha', v.cost_poisha,
    'onHand', v.on_hand, 'reserved', v.reserved, 'isDefault', v.is_default
  ) order by v.position, v.id), '[]'::jsonb)
  from ${productVariants} v
  where v.store_id = ${storeId} and v.product_id = ${productIdColumn} and v.status <> 'archived')`;
}

function photoSnapshot(storeId: string) {
  return sql<CatalogueProduct['photos']>`(select coalesce(jsonb_agg(
    jsonb_build_object('id', f.id, 'objectKey', f.object_key)
    order by array_position(${productImagesColumn}, f.id)), '[]'::jsonb)
    from ${files} f where f.store_id = ${storeId} and f.id = any(${productImagesColumn})
    and f.purpose = 'product_image' and f.status = 'ready')`;
}
