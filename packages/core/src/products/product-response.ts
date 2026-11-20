import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import type { ProductReadiness, ProductResponse } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { CatalogueProduct, Variant } from './products.repository';

export function orderCatalogueProduct(product: CatalogueProduct): OrderCatalogueProduct {
  return {
    id: product.id,
    name: product.name,
    isStockTracked: product.isStockTracked,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      isDefault: variant.isDefault,
      pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
      available: variant.onHand - variant.reserved,
    })),
  };
}

export function toResponse(
  product: CatalogueProduct,
  rows: Variant[],
  lowStockThreshold: number,
  storage: FileStorageDriver,
): ProductResponse {
  const variants = rows.map(({ productId: _productId, ...variant }) => ({
    ...variant,
    pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
    available: variant.onHand - variant.reserved,
  }));
  const readiness: ProductReadiness[] = [];
  if (variants.some((variant) => variant.pricePoisha === 0)) readiness.push('needs_price');
  if (!product.imageFileIds.length) readiness.push('needs_photo');
  if (product.status === 'hidden') readiness.push('hidden');
  if (product.isStockTracked && variants.some((variant) => variant.available <= lowStockThreshold))
    readiness.push('running_low');
  return {
    ...product,
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
