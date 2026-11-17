import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';

import type {
  CreateProductInput,
  ProductListQuery,
  ProductOption,
} from '@dakly/contracts/products';
import { products, productVariants } from '@dakly/db/schema/products';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

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
type CatalogueProduct = Product & { variants: Variant[] };

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

@Injectable()
export class ProductsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findById(storeId: string, id: string): Promise<CatalogueProduct | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...productColumns, variants: variantSnapshot(storeId) })
        .from(products)
        .where(
          and(eq(products.storeId, storeId), eq(products.id, id), ne(products.status, 'archived')),
        ),
    );
    return rows[0];
  }

  list(storeId: string, query: ProductListQuery): Promise<CatalogueProduct[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...productColumns, variants: variantSnapshot(storeId) })
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
              ? sql`exists (select 1 from product_variants v where v.store_id = ${storeId} and v.product_id = ${products.id} and v.status <> 'archived' and coalesce(v.price_override_poisha, ${products.pricePoisha}) = 0)`
              : undefined,
            query.cursor ? lt(products.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(products.id))
        .limit(query.limit + 1),
    );
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
        await tx
          .update(productVariants)
          .set({ status: 'archived', isDefault: false, updatedAt: now })
          .where(
            and(eq(productVariants.storeId, storeId), eq(productVariants.productId, productId)),
          );
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
}

function variantSnapshot(storeId: string) {
  return sql<Variant[]>`(select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'productId', v.product_id, 'title', v.title, 'optionValues', v.option_values,
    'sku', v.sku, 'priceOverridePoisha', v.price_override_poisha, 'costPoisha', v.cost_poisha,
    'onHand', v.on_hand, 'reserved', v.reserved, 'isDefault', v.is_default
  ) order by v.position, v.id), '[]'::jsonb)
  from ${productVariants} v
  where v.store_id = ${storeId} and v.product_id = products.id and v.status <> 'archived')`;
}
