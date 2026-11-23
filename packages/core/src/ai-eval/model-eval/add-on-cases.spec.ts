import { describe, expect, it } from 'vitest';

import { scoreEval } from '../eval-scoring';
import { addOnGoldenCases, addOnRecordedOutcomes } from '../golden-set.add-ons';
import { runFixtureTool } from './fixture-tools';
import { evalShopRules } from './reply-pipeline';

type ConfirmResult = {
  addOns?: { name: string; variants: { priceTaka: number; stock: number }[] }[];
};
const confirm = (draftedOrder: string[], suggestAddOns: boolean) =>
  runFixtureTool('confirm_order', '{"orderNumber":1001}', {
    draftedOrder,
    suggestAddOns,
  }) as ConfirmResult;

describe('add-on cases', () => {
  it('pass the saved run in Bangla, Banglish and English', () => {
    expect(addOnGoldenCases.every(({ id }) => id in addOnRecordedOutcomes)).toBe(true);
    expect(new Set(addOnGoldenCases.map(({ language }) => language))).toEqual(
      new Set(['bangla', 'banglish', 'english']),
    );
    expect(scoreEval(addOnGoldenCases, addOnRecordedOutcomes)).toMatchObject({
      passed: true,
      wrongPriceCaseIds: [],
      outOfStockOfferCaseIds: [],
      unsafeWordingCaseIds: [],
      missedProductCaseIds: [],
    });
  });

  it('fail a reply that offers a product the shop would not pick, a wrong price or a discount', () => {
    const report = scoreEval(addOnGoldenCases, {
      ...addOnRecordedOutcomes,
      'addon-kurti-on-bn': { kind: 'reply', text: 'কনফার্ম হয়েছে। স্নিকার্স ৳1,800 নিবেন?' },
      'addon-kurti-on-banglish': { kind: 'reply', text: 'Confirm. থ্রি পিস ৳1,900 nibén?' },
      'addon-polo-on-english': { kind: 'reply', text: 'Confirmed. Panjabi with 10% off, ৳1,080?' },
      'addon-kurti-off-bn': { kind: 'reply', text: 'কনফার্ম হয়েছে। শাড়ি ৳2,800 নিবেন?' },
    });
    expect(report.outOfStockOfferCaseIds).toEqual(['addon-kurti-on-bn', 'addon-kurti-off-bn']);
    expect(report.wrongPriceCaseIds).toEqual([
      'addon-kurti-on-bn',
      'addon-kurti-on-banglish',
      'addon-polo-on-english',
      'addon-kurti-off-bn',
    ]);
    expect(report.unsafeWordingCaseIds).toEqual(['addon-polo-on-english']);
    expect(report.passed).toBe(false);
  });

  it('turn the switch on only for the cases that set it', () => {
    const on = addOnGoldenCases.filter((golden) => evalShopRules(golden).suggestAddOns);
    expect(on.map(({ id }) => id)).toEqual([
      'addon-kurti-on-bn',
      'addon-kurti-on-banglish',
      'addon-polo-on-english',
      'addon-three-piece-on-mixed',
      'addon-handbag-none-bn',
    ]);
  });
});

describe('the eval shop picks add-ons like the real tool', () => {
  it('returns same-category products in stock, cheapest first, at most two', () => {
    expect(confirm(['কুর্তি'], true).addOns?.map(({ name }) => name)).toEqual(['থ্রি পিস', 'শাড়ি']);
  });

  it('keeps a product out of the picks when its price is over twice the order', () => {
    expect(confirm(['পোলো শার্ট'], true).addOns?.map(({ name }) => name)).toEqual(['লাল পাঞ্জাবি']);
  });

  it('returns none when nothing else in stock shares the category', () => {
    expect(confirm(['হ্যান্ডব্যাগ'], true).addOns).toEqual([]);
    expect(confirm(['ক্যানভাস জুতা'], true).addOns).toEqual([]);
  });

  it('returns no add-ons while the switch is off', () => {
    expect(confirm(['কুর্তি'], false)).toEqual({ orderNumber: 1001, stage: 'to_pack' });
  });
});
