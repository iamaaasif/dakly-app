import type { ProductsService } from '../products/products.service';

// Null unless every item's product has a weight, so a partial total never looks complete.
export async function orderParcelWeightGrams(
  products: ProductsService,
  storeId: string,
  items: { variantId: string; quantity: number }[],
): Promise<number | null> {
  const weights = await products.variantWeights(
    storeId,
    items.map(({ variantId }) => variantId),
  );
  let total = 0;
  for (const { variantId, quantity } of items) {
    const weight = weights.get(variantId);
    if (weight == null) return null;
    total += weight * quantity;
  }
  return items.length ? total : null;
}
