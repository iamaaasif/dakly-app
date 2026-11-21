import { describe, expect, it } from 'vitest';

import { costMicroUsd } from './candidate-prices';
import { searchEvalProducts } from './eval-catalog';
import { runFixtureTool } from './fixture-tools';

describe('model eval helpers', () => {
  it('prices cached input below fresh input', () => {
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 100_000 };
    // 0.5M fresh at $1, 0.5M cached at $0.05, 0.1M output at $5.
    expect(costMicroUsd('gpt-6.1-terra', usage)).toBe(1_025_000);
  });

  it('finds a product by any word of a Banglish question', () => {
    expect(searchEvalProducts('lal punjabi ache?', 3).map(({ name }) => name)).toEqual([
      'লাল পাঞ্জাবি',
    ]);
  });

  it('returns no product for an unknown word', () => {
    expect(runFixtureTool('search_products', JSON.stringify({ query: 'laptop' }))).toEqual({
      products: [],
    });
  });
});
