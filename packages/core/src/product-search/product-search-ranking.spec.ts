import { describe, expect, it } from 'vitest';

import {
  mainColour,
  fitsPrice,
  fuseRanks,
  parseQuery,
  rankByWords,
  type SearchDocument,
} from './product-search-ranking';

const kurti: SearchDocument = {
  id: 'kurti',
  name: 'Cotton Kurti',
  aliases: ['কুর্তি'],
  category: null,
  description: null,
  optionValues: ['M'],
  pricesPoisha: [120_000, 150_000],
};

describe('parseQuery', () => {
  it('drops asking words and reads a price ceiling in Banglish', () => {
    expect(parseQuery('kurti 1500 taka er moddhe ache?')).toEqual({
      words: ['kurti'],
      maxPricePoisha: 150_000,
      minPricePoisha: null,
    });
  });

  it('reads a price ceiling in Bangla digits', () => {
    expect(parseQuery('১৩০০ টাকার নিচে পাঞ্জাবি')).toEqual({
      words: ['পাঞ্জাবি'],
      maxPricePoisha: 130_000,
      minPricePoisha: null,
    });
  });

  it('reads a price floor', () => {
    expect(parseQuery('saree above 3000').minPricePoisha).toBe(300_000);
  });

  it('keeps a number with no price cue as a word', () => {
    expect(parseQuery('sneakers 42')).toEqual({
      words: ['sneakers', '42'],
      maxPricePoisha: null,
      minPricePoisha: null,
    });
  });
});

describe('fitsPrice', () => {
  it('passes when any size is inside the range', () => {
    expect(fitsPrice(kurti, parseQuery('kurti under 1300'))).toBe(true);
    expect(fitsPrice(kurti, parseQuery('kurti under 1000'))).toBe(false);
  });
});

describe('rankByWords', () => {
  it('finds a Bangla alias from a Banglish query', () => {
    expect(rankByWords([kurti], parseQuery('kurti'))).toEqual(['kurti']);
  });

  it('returns nothing when a price word rules every product out', () => {
    expect(rankByWords([kurti], parseQuery('kurti under 500'))).toEqual([]);
  });

  it('returns nothing for a question with no product words', () => {
    expect(rankByWords([kurti], parseQuery('koto taka?'))).toEqual([]);
  });
});

describe('fuseRanks', () => {
  it('ranks a product both lists found above one only a list found', () => {
    expect(fuseRanks(['a', 'b'], ['c', 'b'])).toEqual(['b', 'a', 'c']);
  });
});

describe('mainColour', () => {
  it('reads the first colour in Bangla, Banglish and English', () => {
    expect(mainColour(['লাল', 'চামড়ার'])).toBe('red');
    expect(mainColour(['kurti', 'lal'])).toBe('red');
    expect(mainColour(['yellow', 'red'])).toBe('yellow');
    expect(mainColour(['saree'])).toBeUndefined();
  });
});
