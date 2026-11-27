import { isInStock } from '@dakly/contracts/product-editor-fields';

import type { ChatProduct } from '../products/products.service';
import { isSellable } from './product-photo-match';

const MIN_WORD_LENGTH = 3;

const wordsOf = (product: ChatProduct) =>
  new Set(
    [product.name, product.description ?? '']
      .join(' ')
      .toLowerCase()
      .split(/[\s,.?!।]+/u)
      .filter((word) => [...word].length >= MIN_WORD_LENGTH),
  );

export const sameCategory = (left: ChatProduct, right: ChatProduct) =>
  left.category !== null &&
  right.category !== null &&
  left.category.trim().toLowerCase() === right.category.trim().toLowerCase();

const lowestPrice = (product: ChatProduct) =>
  Math.min(...product.variants.map((variant) => variant.pricePoisha));

// In-stock products of the same category as a product with no stock. Shared words in the name or
// description (a colour, a style) come first, then the closest price. Another category is never
// offered, because a wrong suggestion costs more than none.
export function pickAlternatives(
  soldOut: ChatProduct,
  others: ChatProduct[],
  limit: number,
): ChatProduct[] {
  // Another size in stock is the answer; suggesting other products would only distract.
  if (isSellable(soldOut)) return [];
  const soldOutWords = wordsOf(soldOut);
  const soldOutPrice = lowestPrice(soldOut);
  return others
    .filter((other) => other.id !== soldOut.id && sameCategory(soldOut, other) && isSellable(other))
    .map((other) => ({
      product: inStockOnly(other),
      shared: [...wordsOf(other)].filter((word) => soldOutWords.has(word)).length,
      gap: Math.abs(lowestPrice(inStockOnly(other)) - soldOutPrice),
    }))
    .sort((left, right) => right.shared - left.shared || left.gap - right.gap)
    .slice(0, limit)
    .map(({ product }) => product);
}

// A listing that shows a size with no stock invites the model to offer it.
export function inStockOnly(product: ChatProduct): ChatProduct {
  return {
    ...product,
    variants: product.variants.filter((variant) => isInStock(product, variant.available)),
  };
}
