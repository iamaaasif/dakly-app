import {
  addOnsRule,
  describeAlternatives,
  describePhotoMatch,
} from '../../ai-agent/sales-agent-tools.service';
import { pickAddOns } from '../../product-search/product-add-ons';
import { pickAlternatives } from '../../product-search/product-alternatives';
import { decidePhotoMatch } from '../../product-search/product-photo-match';
import { nameScores, parseQuery } from '../../product-search/product-search-ranking';
import type { ChatProduct } from '../../products/products.service';
import {
  deliveryPolicyPassage,
  deliveryZones,
  evalChatProducts,
  evalProducts,
  evalSearchDocuments,
  productResult,
  searchEvalProducts,
} from './eval-catalog';
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

const ALTERNATIVE_LIMIT = 3;

function presentEvalProduct(product: ChatProduct): object {
  const found = evalProducts.find(({ productId }) => productId === product.id);
  return found ? productResult(found) : {};
}

function findAlternatives({ productId }: Args) {
  const soldOut = evalChatProducts.find(({ id }) => id === productId);
  if (!soldOut) return { error: 'PRODUCT_NOT_FOUND' };
  return describeAlternatives(
    soldOut,
    pickAlternatives(soldOut, evalChatProducts, ALTERNATIVE_LIMIT),
    presentEvalProduct,
  );
}

function joinRestockList({ variantId }: Args) {
  const variant = evalProducts
    .flatMap(({ variants }) => variants)
    .find((v) => v.variantId === variantId);
  if (!variant) return { error: 'PRODUCT_VARIANT_NOT_FOUND' };
  return variant.stock > 0
    ? { error: 'RESTOCK_VARIANT_IN_STOCK' }
    : { onWaitingList: true, variantId };
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
type Handler = (args: Args, onlyProductIds?: readonly string[]) => object;
const handlers: Record<string, Handler> = {
  search_products: ({ query }, onlyProductIds) => ({
    products: searchEvalProducts(String(query ?? ''), SEARCH_LIMIT, onlyProductIds).map(
      productResult,
    ),
  }),
  get_product: (args, onlyProductIds) =>
    onlyProductIds && !onlyProductIds.includes(String(args.productId))
      ? { error: 'NOT_AN_AD_PRODUCT' }
      : productById(args),
  send_product_card: sendProductCard,
  find_alternatives: findAlternatives,
  join_restock_list: joinRestockList,
  get_delivery_charge: () => ({ places: [], zones: deliveryZones }),
  search_knowledge: ({ question }) => ({
    passages: /deliver|ডেলিভারি|charge|চার্জ|din|দিন/iu.test(String(question ?? ''))
      ? [deliveryPolicyPassage]
      : [],
  }),
  get_my_orders: () => ({ orders: [] }),
  get_order_status: () => ({ error: 'ORDER_NOT_FOUND' }),
  draft_order: () => ({ error: 'NOT_IN_A_CHAT' }),
  hand_over: ({ reason }) => ({ reason }),
};

type OrderContext = { draftedOrder?: readonly string[]; suggestAddOns: boolean };

const ADD_ON_LIMIT = 2;

// Mirrors the real tool: only an add-on in stock, with only its sizes in stock.
function presentAddOn(product: ChatProduct): object {
  const found = evalProducts.find(({ productId }) => productId === product.id);
  const sizes = new Set(product.variants.map(({ id }) => id));
  return found
    ? productResult({
        ...found,
        variants: found.variants.filter(({ variantId }) => sizes.has(variantId)),
      })
    : {};
}

function confirmOrder({ draftedOrder, suggestAddOns }: OrderContext) {
  if (!draftedOrder) return { error: 'NOT_IN_A_CHAT' };
  const ordered = evalChatProducts.filter(({ name }) => draftedOrder.includes(name));
  const base = { orderNumber: 1001, stage: 'to_pack' };
  if (!suggestAddOns) return base;
  const itemsTotalPoisha = ordered.reduce(
    (sum, { variants }) => sum + Math.min(...variants.map(({ pricePoisha }) => pricePoisha)),
    0,
  );
  return {
    ...base,
    addOnRule: addOnsRule,
    addOns: pickAddOns(ordered, evalChatProducts, itemsTotalPoisha, ADD_ON_LIMIT).map(presentAddOn),
  };
}

export function runFixtureTool(
  name: string,
  argumentsJson: string,
  order: OrderContext = { suggestAddOns: false },
  onlyProductIds?: readonly string[],
): object {
  if (name === 'confirm_order') return confirmOrder(order);
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
  return handler ? handler(parse(argumentsJson), onlyProductIds) : { error: 'UNKNOWN_TOOL' };
}

// The same decision as ProductSearchService.matchPhoto, over the eval shop.
export function matchEvalPhoto(photoText: string): object {
  const { words } = parseQuery(photoText);
  const scores = nameScores(evalSearchDocuments, words);
  const named = evalChatProducts.filter(({ id }) => scores.has(id));
  const match = decidePhotoMatch(named, scores, words);
  const alternatives =
    match.kind === 'sold_out'
      ? pickAlternatives(match.product, evalChatProducts, ALTERNATIVE_LIMIT)
      : [];
  return describePhotoMatch(match, presentEvalProduct, alternatives);
}
