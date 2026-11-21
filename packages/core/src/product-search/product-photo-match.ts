import type { ChatProduct } from '../products/products.service';
import { lexicalScore, mainColour } from './product-search-ranking';
import { searchWords } from './search-text';

// What a customer's photo points to. Only a sure match is answered as that product; the AI-12
// alternatives for a sold-out match start from `sold_out`.
export type PhotoMatch =
  | {
      kind: 'sure';
      product: ChatProduct;
      variantId: string | null;
      // The tagged shop photo in the customer's colour, to send back.
      photoId: string | null;
      // The customer's colour is a variant with no stock, so it is never offered.
      soldOutVariantId: string | null;
      // The product has colour-tagged photos but none in the customer's colour.
      colourMissing: boolean;
    }
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
    return isSellable(top) ? sureMatch(top, words) : { kind: 'sold_out', product: top };
  // The photo names a product the shop has run out of, so showing other products would mislead.
  if (!isSellable(top) && score(top) >= sureScore) return { kind: 'sold_out', product: top };
  return sellable.length ? { kind: 'unsure', products: sellable } : { kind: 'none' };
}

type Sure = Extract<PhotoMatch, { kind: 'sure' }>;

// The colour in the customer's photo is compared with the colour the vision tier tagged on each
// shop photo, so "lal" in Banglish and "red" in English meet at the same photo.
function sureMatch(product: ChatProduct, words: string[]): Sure {
  const base = { kind: 'sure', product, variantId: matchedVariantId(product, words) } as const;
  const none = { ...base, photoId: null, soldOutVariantId: null, colourMissing: false };
  const colour = mainColour(words);
  const coloured = product.photos
    .map((photo) => ({
      photo,
      colour: mainColour(searchWords([...photo.tags, photo.description ?? ''].join(' '))),
    }))
    .filter((entry) => entry.colour);
  if (!colour || !coloured.length) return none;
  const same = coloured.filter((entry) => entry.colour === colour).map(({ photo }) => photo);
  if (!same.length) return { ...none, colourMissing: true };
  return withPhoto(product, same, base);
}

// A photo of one variant is preferred; a product-level photo only gives the photo to send.
function withPhoto(
  product: ChatProduct,
  same: ChatProduct['photos'],
  base: Pick<Sure, 'kind' | 'product' | 'variantId'>,
): Sure {
  const [photo] = [...same].sort(
    (left, right) => Number(right.variantId !== null) - Number(left.variantId !== null),
  );
  const variantIds = new Set(same.map(({ variantId }) => variantId).filter((id) => id !== null));
  const variant =
    variantIds.size === 1 ? product.variants.find(({ id }) => variantIds.has(id)) : undefined;
  const soldOut = variant !== undefined && variant.available <= 0;
  return {
    ...base,
    variantId: soldOut ? null : (variant?.id ?? base.variantId),
    photoId: soldOut ? null : (photo?.id ?? null),
    soldOutVariantId: soldOut ? variant.id : null,
    colourMissing: false,
  };
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
