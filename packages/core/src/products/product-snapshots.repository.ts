import { getTableName, sql } from 'drizzle-orm';

import type { CreateProductInput, ProductCollectionRef } from '@dakly/contracts/products';
import { files } from '@dakly/db/schema/platform';
import { products, productVariants } from '@dakly/db/schema/products';

export type Product = Omit<CreateProductInput, 'variants' | 'collectionIds'> & {
  collections: ProductCollectionRef[];
  id: string;
  version: number;
  category: string | null;
  brand: string | null;
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
export type PhotoRef = {
  id: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  tags: string[];
};
export type CatalogueVariant = Variant & { imageFileIds: string[]; photos: PhotoRef[] };

// Drizzle strips qualifiers in SELECT expressions; these must refer to the outer product.
const productIdColumn = sql`${sql.identifier(getTableName(products))}.${sql.identifier(products.id.name)}`;
const productImagesColumn = sql`${sql.identifier(getTableName(products))}.${sql.identifier(products.imageFileIds.name)}`;

export function variantSnapshot(storeId: string) {
  return sql<CatalogueVariant[]>`(select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'productId', v.product_id, 'title', v.title, 'optionValues', v.option_values,
    'sku', v.sku, 'priceOverridePoisha', v.price_override_poisha, 'costPoisha', v.cost_poisha, 'lowStockThreshold', v.low_stock_threshold,
    'onHand', v.on_hand, 'reserved', v.reserved, 'isDefault', v.is_default,
    'imageFileIds', v.image_file_ids,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'objectKey', f.object_key, 'contentType', f.content_type, 'sizeBytes', f.size_bytes, 'description', f.photo_description, 'tags', coalesce(to_jsonb(f.photo_tags), '[]'::jsonb))
      order by array_position(v.image_file_ids, f.id)), '[]'::jsonb)
      from ${files} f where f.store_id = ${storeId} and f.id = any(v.image_file_ids)
      and f.purpose = 'product_image' and f.status = 'ready')
  ) order by v.position, v.id), '[]'::jsonb)
  from ${productVariants} v
  where v.store_id = ${storeId} and v.product_id = ${productIdColumn} and v.status <> 'archived')`;
}

export function photoSnapshot(storeId: string) {
  return sql<PhotoRef[]>`(select coalesce(jsonb_agg(
    jsonb_build_object('id', f.id, 'objectKey', f.object_key, 'contentType', f.content_type, 'sizeBytes', f.size_bytes, 'description', f.photo_description, 'tags', coalesce(to_jsonb(f.photo_tags), '[]'::jsonb))
    order by array_position(${productImagesColumn}, f.id)), '[]'::jsonb)
    from ${files} f where f.store_id = ${storeId} and f.id = any(${productImagesColumn})
    and f.purpose = 'product_image' and f.status = 'ready')`;
}

// The names a product carries, read with it so a list needs no second query.
export const labelColumns = {
  tags: sql<
    string[]
  >`(select coalesce(array_agg(t.name order by lower(t.name)), '{}') from product_tag_links l join product_tags t on t.store_id = l.store_id and t.id = l.tag_id where l.product_id = ${productIdColumn})`,
  collections: sql<
    ProductCollectionRef[]
  >`(select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by lower(c.name)), '[]'::jsonb) from product_collection_links l join product_collections c on c.store_id = l.store_id and c.id = l.collection_id where l.product_id = ${productIdColumn})`,
};
