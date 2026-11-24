import { describe, expect, it } from 'vitest';

import { evalCatalogue } from './product-search-eval-set';
import { parseQuery, rankByWords } from './product-search-ranking';

// What AdReadingService hands to the product search: the ad title, then the description and search
// words the vision tier wrote for the picture. A suggestion is only ever shown to the owner to
// confirm, but a wrong first suggestion would still cost the owner a tap, so these must hold.
type AdCase = {
  language: 'bangla' | 'banglish' | 'english' | 'mixed';
  text: string;
  expected: string | null;
};

const adCases: AdCase[] = [
  {
    language: 'banglish',
    text: 'Eid kurti collection\nA blue cotton kurti with print kurti কুর্তি blue নীল',
    expected: 'kurti-cotton',
  },
  {
    language: 'bangla',
    text: 'ঈদের জামদানি শাড়ি\nA jamdani saree in red saree শাড়ি জামদানি',
    expected: 'saree-jamdani',
  },
  {
    language: 'mixed',
    text: 'Eid offer red panjabi, সাদা পাঞ্জাবি\nTwo panjabi panjabi পাঞ্জাবি',
    expected: 'panjabi-red',
  },
  {
    language: 'banglish',
    text: 'Chamra bag new stock\nBrown leather handbag leather bag ব্যাগ',
    expected: 'bag-leather',
  },
  {
    language: 'mixed',
    text: 'নতুন hijab collection\nChiffon hijab হিজাব black',
    expected: 'hijab-chiffon',
  },
  { language: 'english', text: 'Wireless earbuds sale\nBlack earbuds earphone', expected: null },
  { language: 'bangla', text: 'গরুর দুধ ও ঘি\nA jar of ghee ghee ঘি', expected: null },
];

describe('ad suggestion eval set', () => {
  const results = adCases.map((entry) => ({
    ...entry,
    first: rankByWords(evalCatalogue, parseQuery(entry.text))[0] ?? null,
  }));

  it('suggests nothing for a product the shop does not sell', () => {
    expect(results.filter((r) => r.expected === null && r.first !== null)).toEqual([]);
  });

  it('puts the product the ad shows first', () => {
    const asked = results.filter((r) => r.expected !== null);
    expect(
      asked.filter((r) => r.first !== r.expected).map((r) => `${r.text} -> ${r.first}`),
    ).toEqual([]);
  });

  it('covers every language', () => {
    expect(new Set(adCases.map((entry) => entry.language))).toEqual(
      new Set(['bangla', 'banglish', 'english', 'mixed']),
    );
  });
});
