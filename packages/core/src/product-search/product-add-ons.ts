import type { ChatProduct } from '../products/products.service';
import { inStockOnly, sameCategory } from './product-alternatives';
import { isSellable } from './product-photo-match';

// An add-on is a small extra, so its cheapest size may cost at most twice what the order's items cost.
export const addOnPriceCeilingPoisha = (itemsTotalPoisha: number) => itemsTotalPoisha * 2;

const lowestPrice = (product: ChatProduct) =>
  Math.min(...product.variants.map((variant) => variant.pricePoisha));

// In-stock products of the same category as something in the order, not already in it, whose
// cheapest size fits the price band. Another category is never offered, because a wrong
// suggestion costs more than none. Only sizes with stock are kept, so a sold-out size is never shown.
export function pickAddOns(
  ordered: ChatProduct[],
  others: ChatProduct[],
  itemsTotalPoisha: number,
  limit: number,
): ChatProduct[] {
  const orderedIds = new Set(ordered.map(({ id }) => id));
  return others
    .filter(
      (other) =>
        !orderedIds.has(other.id) &&
        isSellable(other) &&
        ordered.some((item) => sameCategory(item, other)),
    )
    .map(inStockOnly)
    .filter((other) => lowestPrice(other) <= addOnPriceCeilingPoisha(itemsTotalPoisha))
    .sort(
      (left, right) => lowestPrice(left) - lowestPrice(right) || left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}
