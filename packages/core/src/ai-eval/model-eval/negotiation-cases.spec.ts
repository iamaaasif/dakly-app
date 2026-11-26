import { describe, expect, it } from 'vitest';

import { scoreEval } from '../eval-scoring';
import { goldenCaseSchema } from '../golden-case';
import { negotiationGoldenCases } from '../golden-set.negotiation';
import { evalProducts } from './eval-catalog';
import { runFixtureTool } from './fixture-tools';

const cases = negotiationGoldenCases;

describe('negotiation golden cases', () => {
  it('covers each scenario in Bangla, Banglish and English', () => {
    expect(cases).toHaveLength(24);
    expect(new Set(cases.map(({ id }) => id)).size).toBe(24);
    expect(cases.every((golden) => goldenCaseSchema.safeParse(golden).success)).toBe(true);
  });

  it('fails a reply that omits or changes the allowed opening offer', () => {
    const first = cases.find(({ id }) => id === 'negotiation-opening-english')!;
    for (const reply of ['The red panjabi is available.', 'I can do ৳950 for the panjabi.'])
      expect(scoreEval([first], { [first.id]: { kind: 'reply', text: reply } }).passed).toBe(false);

    expect(
      scoreEval([first], { [first.id]: { kind: 'reply', text: 'I can do ৳1050 for the panjabi.' } })
        .passed,
    ).toBe(true);
  });

  it.each([
    ['last-price', { kind: 'reply', text: 'The panjabi is ৳950.' }],
    ['opening', { kind: 'reply', text: 'The last price for the panjabi is ৳1050.' }],
    ['third-ask', { kind: 'handover', reason: 'discount' }],
    ['below-floor', { kind: 'handover', reason: 'discount' }],
    ['hand-over-setting', { kind: 'handover', reason: 'other' }],
  ] as const)('fails the run when %s does not follow the expected flow', (id, outcome) => {
    const golden = cases.find((item) => item.id === `negotiation-${id}-english`)!;
    expect(scoreEval([golden], { [golden.id]: outcome })).toMatchObject({
      negotiationFailureCaseIds: [golden.id],
      passed: false,
    });
  });

  it('only supplies the amount for this offer step', () => {
    const args = '{"productName":"red panjabi","variantWords":null}';
    const expected = {
      opening: { kind: 'offered', priceTaka: 1050, isFinal: false },
      'last-price': { kind: 'offered', priceTaka: 950, isFinal: true },
      'below-floor': { kind: 'final' },
      'third-ask': { kind: 'final' },
    };
    for (const [id, outcome] of Object.entries(expected)) {
      const golden = cases.find((item) => item.id === `negotiation-${id}-english`)!;
      expect(
        runFixtureTool('offer_lower_price', args, {
          suggestAddOns: false,
          negotiation: golden.negotiation,
          customerText: golden.question,
        }),
      ).toEqual(outcome);
    }
  });

  it('refuses invalid, out-of-scope or unasked fixture offers', () => {
    const golden = cases.find(({ id }) => id === 'negotiation-opening-english')!;
    const context = {
      suggestAddOns: false,
      negotiation: golden.negotiation,
      customerText: golden.question,
    };
    const args = { productName: 'red panjabi', variantWords: null };
    expect(
      runFixtureTool('offer_lower_price', JSON.stringify({ ...args, price: 100 }), context),
    ).toEqual({ error: 'INVALID_ARGUMENTS' });
    expect(
      runFixtureTool('offer_lower_price', JSON.stringify(args), context, ['unrelated']),
    ).toEqual({ error: 'PRODUCT_NOT_FOUND' });
    expect(
      runFixtureTool('offer_lower_price', JSON.stringify(args), {
        ...context,
        customerText: 'What size?',
      }),
    ).toEqual({ error: 'NOT_A_DISCOUNT_ASK' });
  });

  it('drafts an order at the live offer price without a price argument', () => {
    const golden = cases.find(({ id }) => id === 'negotiation-order-discount-english')!;
    const variant = evalProducts.find(({ name }) => name === golden.negotiation?.productName)
      ?.variants[0];
    const input = {
      items: [{ variantId: variant?.variantId, quantity: 1 }],
      recipientName: 'Nila',
      phone: '01811223344',
      address: 'House 10 Road 2, Mirpur 1',
      area: 'Dhaka',
    };
    expect(
      runFixtureTool('draft_order', JSON.stringify(input), {
        suggestAddOns: false,
        negotiation: golden.negotiation,
      }),
    ).toMatchObject({
      items: [{ unitPriceTaka: 1050, lineDiscountTaka: 150, quantity: 1 }],
      totalTaka: 1110,
    });
  });
});
