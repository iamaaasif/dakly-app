import type { ChatProduct } from '../products/products.service';
import { lexicalScore } from './product-search-ranking';

// What a customer's photo points to. Only a sure match is answered as that product; the AI-12
// alternatives for a sold-out match start from `sold_out`.
export type PhotoMatch =
  | { kind: 'sure'; product: ChatProduct; variantId: string | null }
  | { kind: 'unsure'; products: ChatProduct[] }
  | { kind: 'sold_out'; product: ChatProduct }
  | { kind: 'none' };

const sureScore = 0.8;
// A runner-up this close means the photo could be either, so the customer is asked.
const sureMargin = 0.4;
const choiceLimit = 3;

export function isSellable(product: ChatProduct): boolean {
  return !product.isStockTracked || product.variants.some((variant) => variant.available > 0);
}

// `found` is in search order and `scores` says how strongly the photo names each product.
export function decidePhotoMatch(
  found: ChatProduct[],
  scores: Map<string, number>,
  words: string[],
): PhotoMatch {
  const score = (product: ChatProduct) => scores.get(product.id) ?? 0;
  const ranked = found
    .map((product, order) => ({ product, order }))
    .sort((left, right) => score(right.product) - score(left.product) || left.order - right.order)
    .map(({ product }) => product);
  const [top, second] = ranked;
  if (!top) return { kind: 'none' };
  const sellable = ranked.filter(isSellable).slice(0, choiceLimit);
  if (score(top) >= sureScore && (!second || score(top) - score(second) >= sureMargin))
    return isSellable(top)
      ? { kind: 'sure', product: top, variantId: matchedVariantId(top, words) }
      : { kind: 'sold_out', product: top };
  // The photo names a product the shop has run out of, so showing other products would mislead.
  if (!isSellable(top) && score(top) >= sureScore) return { kind: 'sold_out', product: top };
  return sellable.length ? { kind: 'unsure', products: sellable } : { kind: 'none' };
}

// A size or colour in the photo text picks one variant, only when exactly one is in stock.
function matchedVariantId(product: ChatProduct, words: string[]): string | null {
  const matching = product.variants.filter(
    (variant) =>
      variant.available > 0 &&
      words.some(
        (word) =>
          lexicalScore(
            {
              id: variant.id,
              name: '',
              aliases: [],
              category: null,
              description: null,
              optionValues: [variant.title],
              pricesPoisha: [],
            },
            [word],
          ) >= 0.9,
      ),
  );
  return matching.length === 1 && product.variants.length > 1 ? matching[0]!.id : null;
}
