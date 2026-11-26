import { offerLowerPriceTool } from '@dakly/contracts/ai-agent-tools';
import { amountPatterns, bareOfferPattern } from '@dakly/contracts/reply-wording';

import type { PriceOffersService } from '../price-offers/price-offers.service';
import type { ProductSearchService } from '../product-search/product-search.service';
import { quotedPricesPoisha } from './manipulation-screen';
import type { ToolScope } from './tool-scope';

export type OfferQuote = { ref: string; pricePoisha: number };

export async function offerLowerPrice(
  offers: PriceOffersService,
  search: ProductSearchService,
  { storeId, contactId, chat, adProductIds }: ToolScope,
  raw: unknown,
) {
  const { productName, variantWords } = offerLowerPriceTool.input.parse(raw);
  if (!chat?.discountAskMessageId) return { result: { error: 'NOT_A_DISCOUNT_ASK' } };
  const query = variantWords ? `${productName} ${variantWords}` : productName;
  const product = await productNamedForOffer(search, storeId, query, adProductIds);
  if (!product) return { result: { error: 'PRODUCT_NOT_FOUND' } };
  const result = await offers.offer(
    storeId,
    {
      conversationId: chat.conversationId,
      contactId,
      customerMessageId: chat.discountAskMessageId,
    },
    product.id,
    chat.requestedPricePoisha,
  );
  // Offer references belong to the outbound message, outside the model's tool result.
  if (result.kind !== 'offered') return { result };
  const { kind, pricePoisha, isFinal } = result;
  return {
    result: { kind, priceTaka: pricePoisha / 100, isFinal },
    quote: { ref: `${chat.discountAskMessageId}:${product.id}`, pricePoisha },
  };
}

export function offerPricesInReply(reply: string) {
  return quotedPricesPoisha(reply, [...amountPatterns, bareOfferPattern]);
}

export function quotedOfferSources(results: readonly { quote?: OfferQuote }[], reply: string) {
  const prices = offerPricesInReply(reply);
  const quoted = new Map<number, string | null>();
  for (const { quote } of results) {
    if (!quote || !prices.has(quote.pricePoisha)) continue;
    const previous = quoted.get(quote.pricePoisha);
    quoted.set(
      quote.pricePoisha,
      previous === undefined || previous === quote.ref ? quote.ref : null,
    );
  }
  const refs = [...quoted.values()].filter((ref) => ref !== null);
  return refs.length ? [{ tool: 'price_offer', refs }] : [];
}

async function productNamedForOffer(
  search: ProductSearchService,
  storeId: string,
  query: string,
  adProductIds?: readonly string[],
) {
  if (adProductIds) {
    const found = await search.searchWithin(storeId, adProductIds, query, 2);
    return found.length === 1 ? found[0] : undefined;
  }
  const found = await search.matchPhoto(storeId, query);
  return found.kind === 'sure' ? found.product : undefined;
}
