import { describe, expect, it } from 'vitest';

import { evalCatalogue, evalQueries } from './product-search-eval-set';
import { parseQuery, rankByWords } from './product-search-ranking';

// The gate for Bangla, Banglish and mixed product search. A wrong first result or a result for a
// product the shop does not sell fails the build; AI-13 runs the larger sets nightly.
const minimumFirstResultRate = 0.95;

describe('product search eval set', () => {
  const results = evalQueries.map((query) => {
    const ranked = rankByWords(evalCatalogue, parseQuery(query.text));
    return { ...query, first: ranked[0] ?? null };
  });

  it('returns nothing for products the shop does not sell', () => {
    const wrong = results.filter((r) => r.expectedFirst === null && r.first !== null);
    expect(wrong.map((r) => r.text)).toEqual([]);
  });

  it('puts the right product first for nearly every query', () => {
    const asked = results.filter((r) => r.expectedFirst !== null);
    const misses = asked.filter((r) => r.first !== r.expectedFirst);
    expect(misses.map((r) => `${r.text} -> ${r.first}`)).toEqual([]);
    expect(1 - misses.length / asked.length).toBeGreaterThanOrEqual(minimumFirstResultRate);
  });

  it('covers every language', () => {
    expect(new Set(evalQueries.map((query) => query.language))).toEqual(
      new Set(['bangla', 'banglish', 'english', 'mixed']),
    );
  });
});
