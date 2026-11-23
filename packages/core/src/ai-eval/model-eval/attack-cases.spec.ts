import { describe, expect, it } from 'vitest';

import { screenCustomerTexts } from '../../ai-agent/manipulation-screen';
import { scoreEval } from '../eval-scoring';
import {
  attackGoldenCases,
  attackRecordedOutcomes,
  benignGoldenCases,
  benignRecordedOutcomes,
} from '../golden-set.attacks';
import { bargainingGoldenCases, bargainingRecordedOutcomes } from '../golden-set.bargaining';

const handOver = { handOverDiscounts: true, earlierTexts: [] };

describe('attack golden cases', () => {
  it('has a handover for every attack in the saved set, caught by the screen before any model call', () => {
    for (const golden of attackGoldenCases) {
      expect(golden.isAttack).toBe(true);
      expect(screenCustomerTexts([golden.question], handOver), golden.id).toBe(
        golden.expectedHandover,
      );
      expect(attackRecordedOutcomes[golden.id]).toEqual({
        kind: 'handover',
        reason: golden.expectedHandover,
      });
    }
    expect(new Set(attackGoldenCases.map(({ language }) => language))).toEqual(
      new Set(['bangla', 'banglish', 'english']),
    );
  });

  it('lets ordinary questions that sound like an attack through to the model', () => {
    for (const golden of benignGoldenCases) {
      expect(golden.expectedHandover).toBeNull();
      expect(screenCustomerTexts([golden.question], handOver), golden.id).toBeNull();
      expect(benignRecordedOutcomes[golden.id]?.kind).toBe('reply');
    }
  });
});

describe('bargaining golden cases', () => {
  it('lets a first ask through to the model and hands over a repeat ask or an attack', () => {
    for (const golden of bargainingGoldenCases) {
      const discounts = {
        handOverDiscounts: false,
        earlierTexts: (golden.earlier ?? [])
          .filter(({ from }) => from === 'customer')
          .map(({ text }) => text),
      };
      expect(screenCustomerTexts([golden.question], discounts), golden.id).toBe(
        golden.expectedHandover,
      );
    }
    expect(new Set(bargainingGoldenCases.map(({ language }) => language))).toEqual(
      new Set(['bangla', 'banglish', 'english']),
    );
  });

  it('scores the recorded fixed-price replies with no wrong price or offer', () => {
    const report = scoreEval(bargainingGoldenCases, bargainingRecordedOutcomes);
    expect(report).toMatchObject({
      passed: true,
      wrongPriceCaseIds: [],
      unsafeWordingCaseIds: [],
      outOfStockOfferCaseIds: [],
      unneededHandoverCaseIds: [],
    });
  });

  it('fails a recorded reply that gives a discount while holding the price', () => {
    const report = scoreEval(bargainingGoldenCases, {
      ...bargainingRecordedOutcomes,
      'bargain-chhar-bn': { kind: 'reply', text: 'ঠিক আছে, ১০% ছাড় দিলাম, দাম ৳১,০৮০।' },
    });
    expect(report.passed).toBe(false);
    expect(report.unsafeWordingCaseIds).toEqual(['bargain-chhar-bn']);
    expect(report.wrongPriceCaseIds).toEqual(['bargain-chhar-bn']);
  });
});
