import type { EvalOutcome, GoldenCase } from './golden-case';

// Rules from docs/rules/ai-and-llm.md: no wrong price, and at least 90% correct hand-overs.
export const MIN_HANDOVER_ACCURACY = 0.9;
// Cases that ask for a product must name it or an in-stock alternative; an offer of an item with no
// stock must never happen (docs/tasks.md AI-13).
export const MIN_PRODUCT_RECALL = 0.9;

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
  productCases: number;
  productFound: number;
  // Answered without naming the product or an alternative the case expects.
  missedProductCaseIds: string[];
  outOfStockOfferCaseIds: string[];
  // The product card carried another photo than the one the case expects, or one when none may go.
  wrongPhotoCaseIds: string[];
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
  const count = (has: (golden: GoldenCase) => boolean) =>
    scored.filter((item) => has(item.golden)).length;
  const handoverCases = count(({ expectedHandover }) => expectedHandover !== null);
  const handoverCorrect = handoverCases - missedHandoverCaseIds.length;
  const productCases = count(({ mentionsAnyOf }) => Boolean(mentionsAnyOf));
  const missedProductCaseIds = ids(
    ({ golden, outcome }) =>
      golden.mentionsAnyOf !== undefined &&
      !(outcome.kind === 'reply' && mentionsAny(outcome.text, golden.mentionsAnyOf)),
  );
  const outOfStockOfferCaseIds = ids(
    ({ golden, outcome }) =>
      outcome.kind === 'reply' && mentionsAny(outcome.text, golden.neverOffer ?? []),
  );
  const wrongPhotoCaseIds = ids(hasWrongPhoto);
  return {
    total: cases.length,
    productCases,
    productFound: productCases - missedProductCaseIds.length,
    missedProductCaseIds,
    outOfStockOfferCaseIds,
    wrongPhotoCaseIds,
    wrongPriceCaseIds,
    handoverCases,
    handoverCorrect,
    missedHandoverCaseIds,
    unneededHandoverCaseIds: ids(
      ({ golden, outcome }) => golden.expectedHandover === null && outcome.kind === 'handover',
    ),
    passed:
      wrongPriceCaseIds.length === 0 &&
      outOfStockOfferCaseIds.length === 0 &&
      wrongPhotoCaseIds.length === 0 &&
      (productCases === 0 ||
        (productCases - missedProductCaseIds.length) / productCases >= MIN_PRODUCT_RECALL) &&
      (handoverCases === 0 || handoverCorrect / handoverCases >= MIN_HANDOVER_ACCURACY),
  };
}

function hasWrongPhoto({ golden, outcome }: { golden: GoldenCase; outcome: EvalOutcome }) {
  return (
    golden.cardPhoto !== undefined &&
    outcome.kind === 'reply' &&
    (outcome.cardPhoto ?? null) !== golden.cardPhoto
  );
}

function hasWrongPrice(reply: string, allowed: readonly number[]) {
  const text = reply.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
  return amountPatterns
    .flatMap((pattern) => [...text.matchAll(pattern)])
    .some((match) => !allowed.includes(Number((match[1] ?? '').replaceAll(',', ''))));
}

// A Latin term must be a whole word, so the size "M" is not found in "Medium". A Bangla term may
// carry a suffix ("কুর্তির", "কুর্তিটা"), so it matches as text.
function mentionsAny(reply: string, terms: readonly string[]) {
  return terms.some((term) =>
    /^[\x20-\x7e]+$/.test(term)
      ? new RegExp(
          `(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{M}\\p{N}])`,
          'iu',
        ).test(reply)
      : reply.includes(term),
  );
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
