import { describe, expect, it } from 'vitest';

import { numbersAreFromTools } from './assistant-answer-check';

const sales = { salesTaka: 342800, orders: 904, salesChangePercent: 18.4, days: 30 };

describe('numbersAreFromTools', () => {
  it('accepts figures the tools returned, in any digit style or grouping', () => {
    expect(numbersAreFromTools('Sales were ৳3,42,800 from 904 orders, up 18.4%.', [sales])).toBe(
      true,
    );
    expect(numbersAreFromTools('বিক্রি ৩,৪২,৮০০ টাকা, অর্ডার ৯০৪টি', [sales])).toBe(true);
  });

  it('accepts the size of a negative change when the reply says down', () => {
    expect(
      numbersAreFromTools('Sales are down 12.5% on the 30 days before.', [
        { salesChangePercent: -12.5, days: 30 },
      ]),
    ).toBe(true);
    expect(
      numbersAreFromTools('Sales are down 13.5%.', [{ salesChangePercent: -12.5, days: 30 }]),
    ).toBe(false);
  });

  it('rejects a figure no tool returned', () => {
    expect(numbersAreFromTools('Sales were ৳3,42,900.', [sales])).toBe(false);
    expect(numbersAreFromTools('You made 904 orders and 50 returns.', [sales])).toBe(false);
  });

  it('takes numbers inside text results, such as dates', () => {
    expect(
      numbersAreFromTools('From 1 November', [{ from: '2026-11-01', through: '2026-11-30' }]),
    ).toBe(true);
  });

  it('ignores list numbers and accepts a reply with no figures', () => {
    expect(numbersAreFromTools('1. First\n2. Second', [])).toBe(true);
    expect(numbersAreFromTools('I can’t answer that yet.', [])).toBe(true);
  });
});
