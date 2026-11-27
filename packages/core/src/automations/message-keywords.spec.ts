import { describe, expect, it } from 'vitest';

import { automationTemplates } from '@dakly/contracts/automations/templates';

import { matchesAnyKeyword } from './message-keywords';

describe('matchesAnyKeyword', () => {
  it.each([
    ['দাম কত ভাই?', ['দাম'], true],
    ['দামটা কত', ['দাম'], true],
    ['dam koto?', ['dam'], true],
    ['Dam Koto', ['dam koto'], true],
    ['damta bolen', ['dam'], true],
    ['Adam er sathe kotha', ['dam'], false],
    ['price?', ['price', 'দাম'], true],
    ['pp', ['pp'], true],
    ['happy', ['pp'], false],
    ['এটার দাম koto, price bolen', ['dam', 'price'], true],
    ['size ১২ আছে?', ['size 12'], true],
    ['৪৫০ টাকা হবে?', ['450'], true],
    ['😍😍', ['price', 'দাম'], false],
    ['hello', [], false],
    ['hello', ['  '], false],
    ['1+1 offer', ['1+1'], true],
  ])('%s with %j is %s', (text, keywords, expected) => {
    expect(matchesAnyKeyword(text, keywords)).toBe(expected);
  });
});

describe('the Comment to DM template keywords', () => {
  const [filter] = automationTemplates.comment_to_dm_price.graph.trigger.filters;
  const keywords = filter?.field === 'keywords' ? filter.keywords : [];

  it.each([
    ['দাম কত', true],
    ['dam koto bhai', true],
    ['Price?', true],
    ['pp', true],
    ['প্রাইস কত', true],
    ['😍😍😍', false],
    ['Adam bhai ke dekhlam', false],
    ['দারুণ কালেকশন', false],
  ])('%s is %s', (comment, expected) => {
    expect(matchesAnyKeyword(comment, keywords)).toBe(expected);
  });
});
