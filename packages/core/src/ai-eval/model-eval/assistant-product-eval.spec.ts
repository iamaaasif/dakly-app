import { describe, expect, it } from 'vitest';

import { changeProductsTool, draftProductTool } from '@dakly/contracts/assistant-tools';

import { problemsWith, productPromptCases } from './assistant-product-eval';

describe('Ask Dakly AI product eval', () => {
  it('covers Bangla, Banglish and English prompts, Bangla digits and prices in words', () => {
    const prompts = productPromptCases.map(({ prompt }) => prompt);
    expect(prompts.some((prompt) => /[ঀ-৿]/u.test(prompt))).toBe(true);
    expect(prompts.some((prompt) => /dam|koro|komao/i.test(prompt))).toBe(true);
    expect(prompts.some((prompt) => /[০-৯]/.test(prompt))).toBe(true);
    expect(prompts.some((prompt) => /twelve hundred|barosho|এক হাজার|দশ শতাংশ/i.test(prompt))).toBe(
      true,
    );
    expect(productPromptCases.length).toBeGreaterThanOrEqual(15);
  });

  it('expects only arguments the tools accept', () => {
    expect(
      draftProductTool.input.safeParse({
        name: 'Mug',
        priceTaka: 1200,
        category: null,
        description: null,
        options: [],
        stockEach: 5,
      }).success,
    ).toBe(true);
    expect(
      changeProductsTool.input.safeParse({
        productName: 'Polo',
        priceChange: { how: 'raise_by', amount: 50 },
        stock: null,
      }).success,
    ).toBe(true);
  });

  it('fails a wrong price, an invented price and a price change nobody asked for', () => {
    const [draft] = productPromptCases;
    expect(
      problemsWith(draft!.expected, 'draft_product', { priceTaka: 1200, stockEach: 10 }),
    ).toEqual(['sizes']);
    expect(
      problemsWith(draft!.expected, 'draft_product', { priceTaka: 120, stockEach: 10 }),
    ).toContain('price 120');
    const stockOnly = productPromptCases.find(({ prompt }) => prompt.includes('স্টক ১২'))!;
    expect(
      problemsWith(stockOnly.expected, 'change_products', {
        productName: 'পাঞ্জাবি',
        stock: 12,
        priceChange: { how: 'set', amount: 1 },
      }),
    ).toEqual(['invented price change', 'invented amount']);
    const report = productPromptCases.find(({ prompt }) => prompt.startsWith('Ignore'))!;
    expect(problemsWith(report.expected, 'change_products', {})).toEqual([
      'called change_products',
    ]);
  });
});
