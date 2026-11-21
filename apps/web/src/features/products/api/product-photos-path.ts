export function productPhotosPath(productId: string, variantId?: string) {
  return variantId
    ? `/products/${productId}/variants/${variantId}/photos`
    : `/products/${productId}/photos`;
}
