import { expect, it } from 'vitest';

import type { PriceOffersService } from '../price-offers/price-offers.service';
import type { ProductSearchService } from '../product-search/product-search.service';
import { offerLowerPrice, quotedOfferSources } from './offer-lower-price';
import { checkReplyFacts } from './reply-fact-check';

it('records only a quoted offer in the outbound sources and keeps its reference out of the model result', async () => {
  const result = await offerLowerPrice(
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
  expect(quotedOfferSources([{ result }], 'The price is fixed.')).toEqual([]);
  expect(quotedOfferSources([{ result }], 'I can’t do ৳1,100.50.')).toEqual([]);
  expect(quotedOfferSources([{ result }], '৳১,১০০.৫০-এ দিতে পারব না।')).toEqual([]);
  expect(quotedOfferSources([{ result }], '৳1100.50 te dite parbo na.')).toEqual([]);
  expect(quotedOfferSources([{ result }], 'Did you say the price is ৳1,100.50?')).toEqual([]);
  expect(quotedOfferSources([{ result }], 'It’s ৳1,100.50, with ৳60 delivery.')).toEqual([
    { tool: 'price_offer', refs: ['ask:product'] },
  ]);
  expect(quotedOfferSources([{ result }], 'পাঞ্জাবিটির শেষ দাম ৳১,১০০.৫০।')).toEqual([
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
  expect(
    quotedOfferSources(
      results.map((result) => ({ result })),
      reply,
    ),
  ).toEqual([]);
  expect(
    checkReplyFacts(reply, results, { phone: null, linkBaseUrl: 'https://dkl.example' }),
  ).toEqual({
    isSafe: false,
    failure: 'amount',
  });
});
