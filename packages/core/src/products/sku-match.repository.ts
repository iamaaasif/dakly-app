import { sql } from 'drizzle-orm';

import { products, productVariants } from '@dakly/db/schema/products';

export type SkuMatch = {
  id: string;
  productId: string;
  sku: string;
  isArchived: boolean;
  // What the shop has now, for the dry run to say what a file would change.
  current: {
    pricePoisha: number;
    costPoisha: number | null;
    onHand: number;
    isStockTracked: boolean;
    category: string | null;
    description: string | null;
    status: 'active' | 'hidden' | 'archived';
  };
};

// The SKU is unique per store across archived variants too, so an archived match is reported.
export const skuMatchColumns = {
  id: productVariants.id,
  productId: productVariants.productId,
  sku: sql<string>`${productVariants.sku}`,
  isArchived: sql<boolean>`${productVariants.status} = 'archived' or ${products.status} = 'archived'`,
  current: {
    pricePoisha: sql<number>`coalesce(${productVariants.priceOverridePoisha}, ${products.pricePoisha})::int`,
    costPoisha: sql<number | null>`${productVariants.costPoisha}::int`,
    onHand: productVariants.onHand,
    isStockTracked: products.isStockTracked,
    category: products.category,
    description: products.description,
    status: products.status,
  },
};
