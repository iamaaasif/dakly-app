import { deliveryZones, evalProducts, productResult, searchEvalProducts } from './eval-catalog';
import type { EvalProduct } from './eval-catalog';

const SEARCH_LIMIT = 3;
type Args = Record<string, unknown>;

function parse(raw: string): Args {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Args) : {};
  } catch {
    return {};
  }
}

function productById({ productId }: Args) {
  const found = evalProducts.find((candidate) => candidate.productId === productId);
  return found ? productResult(found) : { error: 'PRODUCT_NOT_FOUND' };
}

// Mirrors the real tool: the photo the model chose, else the product's first one, and a size with
// no stock is marked out of stock.
function sendProductCard({ productId, variantId, photoId, withoutPhoto }: Args) {
  const found = evalProducts.find((candidate) => candidate.productId === productId);
  if (!found) return { error: 'PRODUCT_NOT_FOUND' };
  const variant = found.variants.find((candidate) => candidate.variantId === variantId);
  const error = cardError(found, { variantId, variant, photoId });
  if (error) return { error };
  return {
    ...productResult(found),
    photoFileId: withoutPhoto ? null : (photoId ?? found.photos[0]?.photoId ?? null),
    ...(variant && variant.stock <= 0 ? { outOfStock: true } : {}),
    cardText: cardText(found, variant),
  };
}

function cardError(
  found: EvalProduct,
  chosen: { variantId: unknown; variant: unknown; photoId: unknown },
) {
  if (chosen.variantId && !chosen.variant) return 'PRODUCT_VARIANT_NOT_FOUND';
  if (chosen.photoId && !found.photos.some((photo) => photo.photoId === chosen.photoId))
    return 'PHOTO_NOT_FOUND';
  return null;
}

function cardText(found: EvalProduct, only?: EvalProduct['variants'][number]) {
  const lines = (only ? [only] : found.variants).map(
    (variant) =>
      `${variant.title}: ৳${variant.priceTaka}${variant.stock <= 0 ? ' · স্টক নেই (out of stock)' : ''}`,
  );
  return [found.name, ...lines].join('\n');
}

// Answers the way the real tools do for a shop with this catalog, minus orders and knowledge.
const handlers: Record<string, (args: Args) => object> = {
  search_products: ({ query }) => ({
    products: searchEvalProducts(String(query ?? ''), SEARCH_LIMIT).map(productResult),
  }),
  get_product: productById,
  send_product_card: sendProductCard,
  get_delivery_charge: () => ({ places: [], zones: deliveryZones }),
  search_knowledge: () => ({ passages: [] }),
  get_my_orders: () => ({ orders: [] }),
  get_order_status: () => ({ error: 'ORDER_NOT_FOUND' }),
  draft_order: () => ({ error: 'NOT_IN_A_CHAT' }),
  confirm_order: () => ({ error: 'NOT_IN_A_CHAT' }),
  hand_over: ({ reason }) => ({ reason }),
};

export function runFixtureTool(name: string, argumentsJson: string): object {
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
  return handler ? handler(parse(argumentsJson)) : { error: 'UNKNOWN_TOOL' };
}
