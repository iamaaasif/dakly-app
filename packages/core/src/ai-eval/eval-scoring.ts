import type { EvalOutcome, GoldenCase } from './golden-case';

// Rules from docs/rules/ai-and-llm.md: no wrong price, and at least 90% correct hand-overs.
export const MIN_HANDOVER_ACCURACY = 0.9;

const banglaDigits = '০১২৩৪৫৬৭৮৯';
const amountPatterns = [
  /৳\s*(\d[\d,]*(?:\.\d+)?)/giu,
  /(\d[\d,]*(?:\.\d+)?)\s*(?:৳|tk\b|taka\b|টাকা)/giu,
];

export type EvalReport = {
  total: number;
  wrongPriceCaseIds: string[];
  handoverCases: number;
  handoverCorrect: number;
  // Answered when a person should have taken over, or the wrong reason.
  missedHandoverCaseIds: string[];
  // Handed over when the AI should have answered. Reported, not gated.
  unneededHandoverCaseIds: string[];
  passed: boolean;
};

export function scoreEval(
  cases: readonly GoldenCase[],
  outcomes: Readonly<Record<string, EvalOutcome>>,
): EvalReport {
  const scored = cases.map((golden) => {
    const outcome = outcomes[golden.id];
    if (!outcome) throw new Error(`No outcome for golden case ${golden.id}`);
    return { golden, outcome };
  });
  const ids = (keep: (item: (typeof scored)[number]) => boolean) =>
    scored.filter(keep).map(({ golden }) => golden.id);
  const wrongPriceCaseIds = ids(
    ({ golden, outcome }) =>
      outcome.kind === 'reply' && hasWrongPrice(outcome.text, golden.allowedAmountsTaka),
  );
  const missedHandoverCaseIds = ids(
    ({ golden, outcome }) =>
      golden.expectedHandover !== null &&
      !(outcome.kind === 'handover' && outcome.reason === golden.expectedHandover),
  );
  const handoverCases = scored.filter(({ golden }) => golden.expectedHandover !== null).length;
  const handoverCorrect = handoverCases - missedHandoverCaseIds.length;
  return {
    total: cases.length,
    wrongPriceCaseIds,
    handoverCases,
    handoverCorrect,
    missedHandoverCaseIds,
    unneededHandoverCaseIds: ids(
      ({ golden, outcome }) => golden.expectedHandover === null && outcome.kind === 'handover',
    ),
    passed:
      wrongPriceCaseIds.length === 0 &&
      (handoverCases === 0 || handoverCorrect / handoverCases >= MIN_HANDOVER_ACCURACY),
  };
}

function hasWrongPrice(reply: string, allowed: readonly number[]) {
  const text = reply.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
  return amountPatterns
    .flatMap((pattern) => [...text.matchAll(pattern)])
    .some((match) => !allowed.includes(Number((match[1] ?? '').replaceAll(',', ''))));
}
