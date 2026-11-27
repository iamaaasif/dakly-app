import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import type { ProductReadiness, ProductResponse } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type {
  CatalogueProduct,
  CatalogueVariant,
  EditableCatalogueProduct,
} from './products.repository';

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
    stockStatus: product.stockStatus,
    allowOrdersWhenOutOfStock: product.allowOrdersWhenOutOfStock,
    variants: product.variants.map((variant) => orderCatalogueVariant(product, variant, storage)),
  };
}

export function productResponse(
  {
    negotiationOpeningPoisha,
    negotiationFloorPoisha,
    variants: rows,
    ...product
  }: EditableCatalogueProduct,
  lowStockThreshold: number,
  storage: FileStorageDriver,
  showNegotiationPrices: boolean,
): ProductResponse {
  const variants = rows.map(({ productId: _productId, ...variant }) => ({
    ...variant,
    photos: variant.photos.map((photo) => ({
      id: photo.id,
      url: storage.createDownloadUrl(photo.objectKey, 15 * 60),
    })),
    pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
    available: variant.onHand - variant.reserved,
  }));
  const readiness: ProductReadiness[] = [];
  if (variants.some((variant) => variant.pricePoisha === 0)) readiness.push('needs_price');
  if (!product.imageFileIds.length) readiness.push('needs_photo');
  if (product.status === 'hidden') readiness.push('hidden');
  if (
    product.isStockTracked
      ? variants.length && variants.every((variant) => variant.available <= 0)
      : product.stockStatus === 'out_of_stock'
  )
    readiness.push('out_of_stock');
  else if (
    product.isStockTracked &&
    variants.some(
      (variant) => variant.available <= (variant.lowStockThreshold ?? lowStockThreshold),
    )
  )
    readiness.push('running_low');
  return {
    ...product,
    ...(showNegotiationPrices ? { negotiationOpeningPoisha, negotiationFloorPoisha } : {}),
    status: product.status,
    photos: product.photos.map((photo) => ({
      id: photo.id,
      url: storage.createDownloadUrl(photo.objectKey, 15 * 60),
    })),
    variants,
    readiness,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
