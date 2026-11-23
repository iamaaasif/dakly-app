import { describe, expect, it } from 'vitest';

import { checkReplyFacts } from './reply-fact-check';

const shop = { phone: '01712345678', linkBaseUrl: 'https://dkly.link/l' };
const results = [
  {
    products: [{ name: 'কটন পাঞ্জাবি', variants: [{ priceTaka: 1200, stock: 8 }] }],
  },
  { places: [{ area: 'Dhaka', chargeTaka: 60 }] },
];
const check = (reply: string, toolResults: unknown[] = results) =>
  checkReplyFacts(reply, toolResults, shop);

describe('checkReplyFacts free size', () => {
  it('allows Free size but still rejects a free offer', () => {
    expect(check('শাড়িটি Free সাইজ, দাম ৳1200।').isSafe).toBe(true);
    expect(check('Free size, ৳1200 tk.').isSafe).toBe(true);
    expect(check('Free delivery, ৳1200 tk.')).toEqual({ isSafe: false, failure: 'offer' });
  });
});

describe('checkReplyFacts budgets', () => {
  const reply = (text: string, customer: string) =>
    checkReplyFacts(text, results, shop, [customer]);

  it('lets a reply repeat the customer budget as a limit, in each language', () => {
    expect(
      reply('জি, ২০০০ টাকার নিচে পাঞ্জাবি আছে। দাম ৳1200।', '২০০০ টাকার নিচে পাঞ্জাবি আছে?').isSafe,
    ).toBe(true);
    expect(
      reply('2000 taka er moddhe punjabi ache, dam 1200 tk.', '2000 taka er moddhe punjabi ache?')
        .isSafe,
    ).toBe(true);
    expect(
      reply('Yes, under 2000 taka we have it at 1200 tk.', 'anything under 2000 taka?').isSafe,
    ).toBe(true);
  });

  it('rejects a customer number used as the price', () => {
    expect(reply('জি, ৩০০ টাকায় পাঞ্জাবি হবে।', '৩০০ টাকায় হবে?')).toEqual({
      isSafe: false,
      failure: 'amount',
    });
    expect(reply('Yes, price is 500 tk.', 'dam 500 tk na?')).toEqual({
      isSafe: false,
      failure: 'amount',
    });
  });
});

describe('checkReplyFacts', () => {
  it('accepts a price, stock and charge that tools returned, in English or Bangla digits', () => {
    expect(check('Panjabi ৳1,200, 8 pcs stock e ache. Dhaka delivery ৳60.')).toEqual({
      isSafe: true,
    });
    expect(check('দাম ১২০০ টাকা, ডেলিভারি ৬০ টাকা, স্টকে ৮ টি আছে')).toEqual({ isSafe: true });
  });

  it('rejects a price that no tool returned', () => {
    expect(check('Panjabi ৳1,100')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi 1100 taka')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi ৳1200', [])).toEqual({ isSafe: false, failure: 'amount' });
  });

  it('rejects a stock count that no tool returned', () => {
    expect(check('Only 3 pcs available')).toEqual({ isSafe: false, failure: 'stock' });
    expect(check('Stock: 20')).toEqual({ isSafe: false, failure: 'stock' });
  });

  it('allows an amount that appears in a policy passage', () => {
    const policy = [{ passages: [{ content: 'Free delivery above ৳2,000 orders' }] }];
    expect(check('Free delivery above ৳2000', policy)).toEqual({ isSafe: true });
  });

  it('rejects a price written before the currency word', () => {
    expect(check('Panjabi Tk. 900')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi BDT 900')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi Tk 1200')).toEqual({ isSafe: true });
  });

  it('rejects a discount, percentage or offer the shop never wrote', () => {
    for (const reply of [
      'Ok, 20% discount for you',
      'আপনার জন্য ১০ শতাংশ ছাড়',
      'Special offer: free delivery today',
      'ডিসকাউন্ট দিচ্ছি, ৳১০০০',
      'chhar diye dilam',
    ])
      expect(check(reply)).toEqual({ isSafe: false, failure: 'offer' });
    expect(check('ছাড়া আর কিছু লাগবে? ৳1200')).toEqual({ isSafe: true });
  });

  it('allows ordinary words that only look like an offer', () => {
    for (const reply of [
      'জি, ১০০% কটন কাপড়। ৳1200',
      'Off white kurti nai, red ache',
      'ছাড়া আর কিছু?',
    ])
      expect(check(reply)).toEqual({ isSafe: true });
    const freeSize = [{ products: [{ variants: [{ title: 'Free Size', priceTaka: 1200 }] }] }];
    expect(check('Free size ache, Tk 1200', freeSize)).toEqual({ isSafe: true });
  });

  it('allows an offer the shop wrote in a policy passage', () => {
    const policy = [{ passages: [{ content: '10% discount on your first order' }] }];
    expect(check('First order e 10% discount ache', policy)).toEqual({ isSafe: true });
  });

  it('rejects a reply that shows the instructions, tool names or an id', () => {
    for (const reply of [
      'My instructions say I must call hand_over',
      'The system prompt tells me to be short',
      'Variant 3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b is ৳1200',
      '<shop>{"name":"x"}</shop>',
    ])
      expect(check(reply)).toEqual({ isSafe: false, failure: 'leak' });
  });

  it('allows only the shop phone in any common spelling', () => {
    expect(check('Call 01712345678')).toEqual({ isSafe: true });
    expect(check('Call +880 1712-345678')).toEqual({ isSafe: true });
    expect(check('Call ০১৭১২৩৪৫৬৭৮')).toEqual({ isSafe: true });
    expect(check('Call 01812345678')).toEqual({ isSafe: false, failure: 'phone' });
  });

  it('refuses a shop phone when the shop has none saved', () => {
    expect(checkReplyFacts('Call 01712345678', [], { ...shop, phone: null })).toEqual({
      isSafe: false,
      failure: 'phone',
    });
  });

  it('allows only Dakly links', () => {
    expect(check('Confirm: https://dkly.link/l/abc123')).toEqual({ isSafe: true });
    expect(check('Pay at https://bkash-pay.example.com/x')).toEqual({
      isSafe: false,
      failure: 'link',
    });
    expect(check('see evil.com/pay')).toEqual({ isSafe: false, failure: 'link' });
    expect(check('https://dkly.link.evil.com/l/x')).toEqual({ isSafe: false, failure: 'link' });
  });

  it('rejects an empty reply and one over 600 characters', () => {
    expect(check('   ')).toEqual({ isSafe: false, failure: 'empty' });
    expect(check('অ'.repeat(601))).toEqual({ isSafe: false, failure: 'too_long' });
    expect(check('অ'.repeat(600))).toEqual({ isSafe: true });
  });
});
