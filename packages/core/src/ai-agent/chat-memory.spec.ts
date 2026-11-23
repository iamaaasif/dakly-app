import { describe, expect, it } from 'vitest';

import {
  conversationEntries,
  type HistoryMessage,
  recentlyShownProductIds,
  shownProductIds,
} from './chat-memory';

const message = (overrides: Partial<HistoryMessage>): HistoryMessage => ({
  id: 'm',
  direction: 'in',
  body: null,
  mediaText: null,
  aiSources: null,
  ...overrides,
});
const kurti = { productId: 'p-kurti', name: 'কুর্তি' };
const polo = { productId: 'p-polo', name: 'Polo Shirt' };

describe('conversationEntries', () => {
  it('puts a photo’s words with its caption, oldest first, and drops empty messages', () => {
    const entries = conversationEntries([
      message({ direction: 'out', body: 'জি, আছে।' }),
      message({ mediaText: 'Photo: red kurti', body: 'eta ache?' }),
      message({ body: null }),
    ]);

    expect(entries).toEqual([
      { from: 'customer', text: 'Photo: red kurti\neta ache?' },
      { from: 'shop', text: 'জি, আছে।' },
    ]);
  });
});

describe('recentlyShownProductIds', () => {
  it('takes the newest shown products first and ignores sources it cannot read', () => {
    const ids = recentlyShownProductIds([
      message({ direction: 'out', aiSources: [{ tool: 'shown_products', refs: ['p-polo'] }] }),
      message({ direction: 'out', aiSources: 'broken' }),
      message({
        direction: 'out',
        aiSources: [
          { tool: 'search_products', refs: ['p-guess'] },
          { tool: 'shown_products', refs: ['p-kurti', 'p-polo'] },
        ],
      }),
    ]);

    expect(ids).toEqual(['p-polo', 'p-kurti']);
  });

  it('never takes a product from a customer message', () => {
    const ids = recentlyShownProductIds([
      message({ aiSources: [{ tool: 'shown_products', refs: ['p-kurti'] }] }),
    ]);

    expect(ids).toEqual([]);
  });
});

describe('shownProductIds', () => {
  it('keeps a carded product and a named one, but not a search guess the reply never names', () => {
    const ids = shownProductIds(
      [
        { tool: 'search_products', result: { products: [kurti, polo] } },
        { tool: 'send_product_card', result: { cardText: 'x', ...polo } },
      ],
      'কুর্তি আছে, ৳১,৪৫০।',
    );

    expect(ids.toSorted()).toEqual(['p-kurti', 'p-polo']);
  });

  it('keeps a sure photo match in a Banglish reply that does not repeat the Bangla name', () => {
    const ids = shownProductIds(
      [{ tool: 'match_photo', result: { photoMatch: 'sure', products: [kurti] } }],
      'Ji, eta ache, 1450 taka.',
    );

    expect(ids).toEqual(['p-kurti']);
  });

  it('keeps nothing from an unsure photo match the reply does not name', () => {
    const ids = shownProductIds(
      [{ tool: 'match_photo', result: { photoMatch: 'unsure', products: [kurti, polo] } }],
      'কোন প্রোডাক্টটি চাচ্ছেন?',
    );

    expect(ids).toEqual([]);
  });

  it('matches a name in any letter case', () => {
    const ids = shownProductIds(
      [{ tool: 'search_products', result: { products: [polo] } }],
      'polo shirt M size e ache',
    );

    expect(ids).toEqual(['p-polo']);
  });
});
