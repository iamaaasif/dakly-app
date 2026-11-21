import { describePhotoMatch } from '../../ai-agent/sales-agent-tools.service';
import { decidePhotoMatch } from '../../product-search/product-photo-match';
import { nameScores, parseQuery } from '../../product-search/product-search-ranking';
import {
  deliveryZones,
  evalChatProducts,
  evalProducts,
  evalSearchDocuments,
  productResult,
  searchEvalProducts,
} from './eval-catalog';

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

// Answers the way the real tools do for a shop with this catalog, minus orders and knowledge.
const handlers: Record<string, (args: Args) => object> = {
  search_products: ({ query }) => ({
    products: searchEvalProducts(String(query ?? ''), SEARCH_LIMIT).map(productResult),
  }),
  get_product: productById,
  send_product_card: productById,
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

// The same decision as ProductSearchService.matchPhoto, over the eval shop.
export function matchEvalPhoto(photoText: string): object {
  const { words } = parseQuery(photoText);
  const scores = nameScores(evalSearchDocuments, words);
  const named = evalChatProducts.filter(({ id }) => scores.has(id));
  const match = decidePhotoMatch(named, scores, words);
  return describePhotoMatch(match, (product) => {
    const found = evalProducts.find(({ productId }) => productId === product.id);
    return found ? productResult(found) : {};
  });
}
