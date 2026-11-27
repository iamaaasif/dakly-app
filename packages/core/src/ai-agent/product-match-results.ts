import { isInStock } from '@dakly/contracts/product-editor-fields';

import type { PhotoMatch } from '../product-search/product-search.service';
import type { ChatProduct } from '../products/products.service';

// The rule tells the model what it may do with the answer, so a guess is never presented as a match.
export function describePhotoMatch(
  match: PhotoMatch,
  present: (product: ChatProduct) => object,
  alternatives: ChatProduct[],
): object {
  if (match.kind === 'sure') return describeSureMatch(match, present);
  if (match.kind === 'unsure')
    return {
      photoMatch: 'unsure',
      rule: 'Do not pick one. Ask "কোন প্রোডাক্টটি চাচ্ছেন?" and send a card for each product with send_product_card.',
      products: match.products.map(present),
    };
  if (match.kind === 'sold_out')
    return {
      photoMatch: 'sold_out',
      rule: 'The photo shows this product and it has no stock. Say so. Do not offer it or take an order for it.',
      ...describeAlternatives(match.product, alternatives, present),
    };
  return {
    photoMatch: 'none',
    rule: 'No product fits the photo. Do not guess. Ask for the product name or a clearer photo.',
    products: [],
  };
}

function describeSureMatch(
  match: Extract<PhotoMatch, { kind: 'sure' }>,
  present: (product: ChatProduct) => object,
) {
  const products = [present(match.product)];
  if (match.soldOutVariantId)
    return {
      photoMatch: 'sure',
      rule: 'The photo shows this product but the colour or size in it has no stock. Say so. Offer only the in-stock variants listed here, with their listed prices. Ask "নতুন স্টক এলে জানাবো?" and call join_restock_list with soldOutVariantId only after the customer says yes.',
      soldOutVariantId: match.soldOutVariantId,
      products,
    };
  if (match.colourMissing)
    return {
      photoMatch: 'sure',
      rule: 'The photo shows this product but the shop has no photo in that colour. Say so and list the colours in the photos. Send a card with withoutPhoto true so another colour is not shown as the one asked for. Price and stock only from the listing.',
      products,
    };
  return {
    photoMatch: 'sure',
    rule:
      'Answer as this product, with its listed price and stock only.' +
      (match.photoId
        ? ' Send its card with photoId (and variantId when given) so the customer sees the matching photo.'
        : ''),
    ...(match.variantId ? { matchedVariantId: match.variantId } : {}),
    ...(match.photoId ? { photoId: match.photoId } : {}),
    products,
  };
}

const alternativesRule =
  'Say the product or size is out of stock. Offer only the in-stock sizes and alternatives listed here, with their listed prices. If there are none, say there is nothing similar in stock now. Then ask "নতুন স্টক এলে জানাবো?". Call join_restock_list with a soldOutVariants variantId only after the customer says yes.';

// What the model may offer in place of a sold-out product, and what the customer can wait for.
export function describeAlternatives(
  product: ChatProduct,
  alternatives: ChatProduct[],
  present: (product: ChatProduct) => object,
): object {
  const soldOut = product.variants.filter((variant) => !isInStock(product, variant.available));
  return {
    rule: alternativesRule,
    products: [present(product)],
    inStockSizes: product.variants
      .filter((variant) => isInStock(product, variant.available))
      .map((variant) => ({ variantId: variant.id, title: variant.title })),
    soldOutVariants: soldOut.map((variant) => ({ variantId: variant.id, title: variant.title })),
    alternatives: alternatives.map(present),
  };
}
