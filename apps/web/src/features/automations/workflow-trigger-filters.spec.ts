import { describe, expect, it } from 'vitest';

import { emptyWorkflow } from './workflow-library';
import { addKeywords, findFilter, setFilter, toggleValue } from './workflow-trigger-filters';

describe('trigger filters', () => {
  it('adds, replaces and clears a filter', () => {
    const withKeywords = setFilter(emptyWorkflow, 'keywords', {
      field: 'keywords',
      keywords: ['dam'],
    });
    expect(findFilter(withKeywords, 'keywords')?.keywords).toEqual(['dam']);
    const replaced = setFilter(withKeywords, 'keywords', {
      field: 'keywords',
      keywords: ['price'],
    });
    expect(replaced.trigger.filters).toHaveLength(1);
    expect(setFilter(replaced, 'keywords', null).trigger.filters).toEqual([]);
  });

  it('splits Bangla, Banglish and English keywords and skips repeats', () => {
    expect(addKeywords(['দাম'], 'dam koto, Price?\nপ্রাইস, দাম, DAM KOTO')).toEqual([
      'দাম',
      'dam koto',
      'Price?',
      'প্রাইস',
    ]);
  });

  it('toggles a value in a list', () => {
    expect(toggleValue(['price'], 'order')).toEqual(['price', 'order']);
    expect(toggleValue(['price', 'order'], 'price')).toEqual(['order']);
  });
});
