import { describe, expect, it } from 'vitest';

import { commentPriceReply, priceQuestion } from './comment-price-reply';

describe('Facebook price comments', () => {
  it.each([
    ['দাম কত?', 'bangla'],
    ['দাম please?', 'bangla'],
    ['Price koto?', 'banglish'],
    ['How much is this?', 'english'],
  ] as const)('recognises %s without guessing the product', (text, language) => {
    expect(priceQuestion(text)).toBe(language);
  });

  it.each([
    'price is a scam',
    'discount price please',
    'buy here https://example.test',
    '😡',
    'Inbox me',
  ])('leaves %s for staff', (text) => expect(priceQuestion(text)).toBeUndefined());

  const product = { name: 'Blue Kurti', isStockTracked: true };
  const variant = (available: number, pricePoisha: number) => ({ available, pricePoisha });

  it('quotes the current available price privately', () => {
    expect(
      commentPriceReply('english', {
        ...product,
        variants: [variant(1, 120000), variant(0, 90000)],
      }),
    ).toEqual({
      publicBody: 'I sent the price in Messenger.',
      privateBody: 'Blue Kurti costs ৳1,200.',
    });
  });

  it.each([
    { variants: [variant(0, 120000)] },
    { variants: [variant(1, 120000), variant(1, 90000)] },
  ])('skips sold-out products and prices that depend on the variant', ({ variants }) =>
    expect(commentPriceReply('english', { ...product, variants })).toBeUndefined(),
  );
});
