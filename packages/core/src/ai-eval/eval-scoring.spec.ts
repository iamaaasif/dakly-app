import { describe, expect, it } from 'vitest';

import { scoreEval } from './eval-scoring';
import type { EvalOutcome, GoldenCase } from './golden-case';
import { replayResponder } from './golden-eval.service';
import { sampleGoldenCases, sampleRecordedOutcomes } from './golden-set.sample';

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
