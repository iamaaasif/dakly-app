import { describe, expect, it } from 'vitest';

import { scoreEval } from './eval-scoring';
import type { EvalOutcome, GoldenCase } from './golden-case';
import { replayResponder } from './golden-eval.service';
import { banglaGoldenCases, banglaRecordedOutcomes } from './golden-set.bangla';
import {
  activeGoldenCases,
  allRecordedOutcomes,
  pendingTasks,
  sampleGoldenCases,
  sampleRecordedOutcomes,
} from './golden-set.sample';

describe('scoreEval', () => {
  it('passes the saved sample run', () => {
    const report = scoreEval(sampleGoldenCases, sampleRecordedOutcomes);
    expect(report).toMatchObject({ total: 6, handoverCases: 3, handoverCorrect: 3, passed: true });
  });

  it('fails when a reply quotes a price the catalog does not hold', () => {
    const report = scoreEval(sampleGoldenCases, {
      ...sampleRecordedOutcomes,
      'price-bn': { kind: 'reply', text: 'দাম ৳১,০০০।' },
    });
    expect(report.wrongPriceCaseIds).toEqual(['price-bn']);
    expect(report.passed).toBe(false);
  });

  it('counts a wrong hand-over reason and a missed hand-over', () => {
    const report = scoreEval(sampleGoldenCases, {
      ...sampleRecordedOutcomes,
      'refund-en': { kind: 'handover', reason: 'complaint' },
      'discount-bn': { kind: 'reply', text: 'ঠিক আছে।' },
    });
    expect(report.missedHandoverCaseIds).toEqual(['refund-en', 'discount-bn']);
    expect(report.passed).toBe(false);
  });

  it('reports an unneeded hand-over without failing the run', () => {
    const report = scoreEval(sampleGoldenCases, {
      ...sampleRecordedOutcomes,
      'delivery-en': { kind: 'handover', reason: 'out_of_scope' },
    });
    expect(report.unneededHandoverCaseIds).toEqual(['delivery-en']);
    expect(report.passed).toBe(true);
  });

  it('allows one miss in ten hand-over cases', () => {
    const cases: GoldenCase[] = Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index}`,
      language: 'english',
      question: 'refund please',
      expectedHandover: 'refund',
      allowedAmountsTaka: [],
    }));
    const outcomes: Record<string, EvalOutcome> = Object.fromEntries(
      cases.map(({ id }, index) => [
        id,
        index === 0 ? { kind: 'reply', text: 'ok' } : { kind: 'handover', reason: 'refund' },
      ]),
    );
    expect(scoreEval(cases, outcomes).passed).toBe(true);
  });

  it('throws when a case has no outcome', () => {
    expect(() => scoreEval(sampleGoldenCases, {})).toThrow('No outcome for golden case');
  });
});

describe('Bangla and Banglish set', () => {
  const allCases = [...sampleGoldenCases, ...banglaGoldenCases];

  it('passes the saved run with every case switched on', () => {
    const report = scoreEval(allCases, allRecordedOutcomes);
    expect(report).toMatchObject({
      wrongPriceCaseIds: [],
      outOfStockOfferCaseIds: [],
      missedProductCaseIds: [],
      passed: true,
    });
    expect(report.productCases).toBeGreaterThan(10);
  });

  it('has a recorded answer for every case and skips cases that wait on unmerged work', () => {
    expect(banglaGoldenCases.every(({ id }) => id in banglaRecordedOutcomes)).toBe(true);
    expect(
      activeGoldenCases.some(({ dependsOn }) => dependsOn && pendingTasks.includes(dependsOn)),
    ).toBe(false);
    expect(activeGoldenCases.length).toBeLessThan(allCases.length);
  });

  it('fails when the answer offers an item with no stock', () => {
    const report = scoreEval(banglaGoldenCases, {
      ...banglaRecordedOutcomes,
      'oos-product-bn': { kind: 'reply', text: 'ক্যানভাস জুতা বা লোফার নিন, ৳১,৫০০।' },
    });
    expect(report.outOfStockOfferCaseIds).toEqual(['oos-product-bn']);
    expect(report.passed).toBe(false);
  });

  it('counts a handed-over or wrong-product answer as a missed product', () => {
    const report = scoreEval(banglaGoldenCases, {
      ...banglaRecordedOutcomes,
      'search-kurti-bn': { kind: 'handover', reason: 'out_of_scope' },
      'search-kurti-banglish': { kind: 'reply', text: 'শাড়ি আছে।' },
    });
    expect(report.missedProductCaseIds).toEqual(['search-kurti-bn', 'search-kurti-banglish']);
  });

  it('fails when the card carries another colour than the one asked for', () => {
    const report = scoreEval(banglaGoldenCases, {
      ...banglaRecordedOutcomes,
      'photo-colour-red-bn': { kind: 'reply', text: 'কুর্তি আছে।', cardPhoto: 'kurti-blue' },
    });
    expect(report.wrongPhotoCaseIds).toEqual(['photo-colour-red-bn']);
    expect(report.passed).toBe(false);
  });

  it('matches a size only as a whole word', () => {
    const report = scoreEval(banglaGoldenCases, {
      ...banglaRecordedOutcomes,
      'oos-size-banglish': { kind: 'reply', text: 'Medium size nai, 650 taka.' },
    });
    expect(report.missedProductCaseIds).toEqual(['oos-size-banglish']);
  });
});

describe('replayResponder', () => {
  it('returns the recorded outcome and rejects an unrecorded case', async () => {
    const respond = replayResponder(sampleRecordedOutcomes);
    await expect(respond(sampleGoldenCases[3]!)).resolves.toEqual({
      kind: 'handover',
      reason: 'refund',
    });
    await expect(respond({ ...sampleGoldenCases[0]!, id: 'unknown' })).rejects.toThrow(
      'No recorded outcome',
    );
  });
});
