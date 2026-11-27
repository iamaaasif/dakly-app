import { describe, expect, it } from 'vitest';

import { commentLanguage, commentPriceReply, priceQuestion } from './comment-price-reply.service';

describe('Facebook price comments', () => {
  it.each([
    ['দাম কত?', 'bangla'],
    ['দাম কতো?', 'bangla'],
    ['কত টাকা', 'bangla'],
    ['কতো দাম ভাই', 'bangla'],
    ['দাম please?', 'banglish'],
    ['Price koto?', 'banglish'],
    ['dam?', 'banglish'],
    ['daam koto', 'banglish'],
    ['koto taka', 'banglish'],
    ['price কত', 'banglish'],
    ['dam কত', 'banglish'],
    ['দাম koto', 'banglish'],
    ['Price কতো ভাই', 'banglish'],
    ['How much is this?', 'english'],
    ['pp', 'english'],
    ['p.p', 'english'],
    ['price pls', 'english'],
  ] as const)('recognises %s without guessing the product', (text, language) => {
    expect(priceQuestion(text)).toBe(language);
  });

  it.each([
    'price is a scam',
    'discount price please',
    'buy here https://example.test',
    '😡',
    'Inbox me',
    'dam koto ar delivery charge koto?',
    'price কত https://example.test',
    'koto taka lagbe discount hole',
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

describe('commentLanguage', () => {
  it.each([
    ['এটার দাম কত, আমি নিব', 'bangla'],
    ['ami nibo, dam koto vai', 'banglish'],
    ['এটার price koto', 'bangla'],
    ['Is this available? I want to order', 'english'],
  ])('reads %s as %s', (text, expected) => {
    expect(commentLanguage(text)).toBe(expected);
  });
});
