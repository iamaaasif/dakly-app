// Null unless every item's product has a weight, so a partial total never looks complete.
export function parcelWeightGrams(
  items: { variantId: string; quantity: number }[],
  weights: Map<string, number | null>,
): number | null {
  let total = 0;
  for (const { variantId, quantity } of items) {
    const weight = weights.get(variantId);
    if (weight == null) return null;
    total += weight * quantity;
  }
  return items.length ? total : null;
}
