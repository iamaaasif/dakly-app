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
