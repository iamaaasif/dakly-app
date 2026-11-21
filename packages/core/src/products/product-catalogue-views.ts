import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import type { ProductResponse } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { CatalogueProduct, CatalogueVariant } from './products.repository';

type OrderCatalogueVariant = OrderCatalogueProduct['variants'][number];
type ChatPhoto = {
  id: string;
  variantId: string | null;
  description: string | null;
  tags: string[];
};
export type ChatProduct = Omit<OrderCatalogueProduct, 'variants'> &
  Pick<ProductResponse, 'description' | 'category'> & {
    // Every photo of the product and its variants, with what the vision tier saw in it.
    photos: ChatPhoto[];
    variants: (OrderCatalogueVariant & { photoFileId: string | null })[];
  };

export function chatProduct(product: CatalogueProduct, storage: FileStorageDriver): ChatProduct {
  return {
    ...orderCatalogueProduct(product, storage),
    variants: product.variants.map((variant) => ({
      ...orderCatalogueVariant(product, variant, storage),
      photoFileId: effectivePhoto(product, variant)?.id ?? null,
    })),
    photos: [
      ...product.photos.map((photo) => ({ ...photoTags(photo), variantId: null })),
      ...product.variants.flatMap((variant) =>
        variant.photos.map((photo) => ({ ...photoTags(photo), variantId: variant.id })),
      ),
    ],
    description: product.description,
    category: product.category,
  };
}

function photoTags({ id, description, tags }: CatalogueProduct['photos'][number]) {
  return { id, description, tags };
}

// A variant without its own photo shows the product's first photo.
function effectivePhoto(product: CatalogueProduct, variant: CatalogueVariant) {
  return variant.photos[0] ?? product.photos[0];
}

function orderCatalogueVariant(
  product: CatalogueProduct,
  variant: CatalogueVariant,
  storage: FileStorageDriver,
): OrderCatalogueVariant {
  const photo = effectivePhoto(product, variant);
  return {
    id: variant.id,
    title: variant.title,
    isDefault: variant.isDefault,
    pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
    available: variant.onHand - variant.reserved,
    photoUrl: photo ? storage.createDownloadUrl(photo.objectKey, 15 * 60) : null,
  };
}

export function orderCatalogueProduct(
  product: CatalogueProduct,
  storage: FileStorageDriver,
): OrderCatalogueProduct {
  return {
    id: product.id,
    name: product.name,
    isStockTracked: product.isStockTracked,
    variants: product.variants.map((variant) => orderCatalogueVariant(product, variant, storage)),
  };
}
