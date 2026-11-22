import { describe, expect, it } from 'vitest';

import { assistantDraftValues, assistantFilledFields } from './product-assistant-draft';
import { assistantDraftHref, parseAssistantDraft } from '@/lib/assistant-product-draft-link';

const draft = {
  name: 'Black cotton T-shirt',
  pricePoisha: 120_000,
  options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
  stockEach: 10,
};

describe('Ask Dakly AI product draft', () => {
  it('fills the name, price, one row per size and the stock of each, hidden until saved', () => {
    const values = assistantDraftValues(draft);
    expect(values).toMatchObject({ name: 'Black cotton T-shirt', pricePoisha: '1200.00' });
    expect(values.status).toBe('hidden');
    expect(values.variants?.map((variant) => [variant.optionValues, variant.initialStock])).toEqual(
      ['S', 'M', 'L', 'XL'].map((size) => [{ 0: size }, 10]),
    );
  });

  it('makes one plain row for a product without options and leaves the price blank when unsaid', () => {
    const values = assistantDraftValues({ name: 'Mug', options: [] });
    expect(values.pricePoisha).toBe('');
    expect(values.variants).toHaveLength(1);
    expect(values.variants?.[0]?.initialStock).toBe(0);
  });

  it('names the fields it filled', () => {
    expect(assistantFilledFields(draft)).toEqual(['Name', 'Price', 'Size', 'Stock']);
    expect(assistantFilledFields({ name: 'Mug', options: [] })).toEqual(['Name']);
  });

  it('travels in the address and is checked again on the page', () => {
    const href = assistantDraftHref(draft);
    const params = Object.fromEntries(new URL(href, 'https://dakly.test').searchParams);
    expect(parseAssistantDraft(params)).toEqual(draft);
    expect(parseAssistantDraft({ assistantDraft: '{"name":"","pricePoisha":-5}' })).toBeUndefined();
    expect(parseAssistantDraft({ assistantDraft: 'not json' })).toBeUndefined();
    expect(parseAssistantDraft({})).toBeUndefined();
  });
});
