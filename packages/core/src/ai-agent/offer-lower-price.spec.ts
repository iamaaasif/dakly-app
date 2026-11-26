import { expect, it } from 'vitest';

import type { PriceOffersService } from '../price-offers/price-offers.service';
import type { ProductSearchService } from '../product-search/product-search.service';
import { offerLowerPrice, quotedOfferSources } from './offer-lower-price';
import { checkReplyFacts } from './reply-fact-check';

it('records only a quoted offer in the outbound sources and keeps its reference out of the model result', async () => {
  const { result, quote } = await offerLowerPrice(
    {
      offer: async () => ({ kind: 'offered', pricePoisha: 110050, isFinal: false }),
    } as PriceOffersService,
    { searchWithin: async () => [{ id: 'product' }] } as ProductSearchService,
    {
      storeId: 'store',
      contactId: 'buyer',
      adProductIds: ['product'],
      chat: { conversationId: 'chat', channel: 'messenger', discountAskMessageId: 'ask' },
    },
    { productName: 'Panjabi', variantWords: null },
  );
  expect(result).toEqual({ kind: 'offered', priceTaka: 1100.5, isFinal: false });
  expect(quotedOfferSources([quote!], 'The price is fixed.')).toEqual([]);
  expect(quotedOfferSources([quote!], 'It’s ৳1,100.50, with ৳60 delivery.')).toEqual([
    { tool: 'price_offer', refs: ['ask:product'] },
  ]);
  expect(quotedOfferSources([quote!], '৳১,১০০.৫০ এ দিতে পারব, এর নিচে না।')).toEqual([
    { tool: 'price_offer', refs: ['ask:product'] },
  ]);
});

it('refuses a quote that has the same amount for two different products', async () => {
  const offers = {
    offer: async () => ({ kind: 'offered', pricePoisha: 110050, isFinal: false }),
  } as PriceOffersService;
  const search = {
    searchWithin: async (_store: string, ids: string[]) => [{ id: ids[0] }],
  } as ProductSearchService;
  const results = await Promise.all(
    ['panjabi', 'kurti'].map((name) =>
      offerLowerPrice(
        offers,
        search,
        {
          storeId: 'store',
          contactId: 'buyer',
          adProductIds: [name],
          chat: { conversationId: 'chat', channel: 'messenger', discountAskMessageId: 'ask' },
        },
        { productName: name, variantWords: null },
      ),
    ),
  );
  const reply = 'I can offer ৳1,100.50.';
  const quotes = results.map(({ quote }) => quote!);
  expect(quotedOfferSources(quotes, reply)).toEqual([]);
  expect(
    checkReplyFacts(
      reply,
      results.map(({ result }) => result),
      { phone: null, linkBaseUrl: 'https://dkl.example' },
      [],
      quotes,
    ),
  ).toEqual({
    isSafe: false,
    failure: 'amount',
  });
});
