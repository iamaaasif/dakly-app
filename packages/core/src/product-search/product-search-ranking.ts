import { isWithinOneEdit, searchWords, wordKey } from './search-text';

export type SearchDocument = {
  id: string;
  name: string;
  aliases: string[];
  category: string | null;
  description: string | null;
  // Size, colour and other option values, as the shop wrote them.
  optionValues: string[];
  // The price of every size, in poisha.
  pricesPoisha: number[];
};

export type ParsedQuery = {
  words: string[];
  maxPricePoisha: number | null;
  minPricePoisha: number | null;
};

// The same colour or garment in Bangla script, Banglish and English. Members are written the way
// shoppers type them; each one is reduced to its key so spelling variants land on the group too.
const colourGroups: string[][] = [
  ['red', 'lal', 'লাল'],
  ['blue', 'nil', 'neel', 'নীল', 'নিল'],
  ['black', 'kalo', 'কালো'],
  ['white', 'shada', 'sada', 'safed', 'সাদা'],
  ['green', 'sobuj', 'সবুজ'],
  ['yellow', 'holud', 'হলুদ'],
  ['pink', 'golapi', 'গোলাপি', 'গোলাপী'],
  ['purple', 'beguni', 'বেগুনি'],
  ['orange', 'komola', 'কমলা'],
  ['grey', 'gray', 'ধূসর'],
  ['brown', 'badami', 'বাদামি'],
  ['maroon', 'মেরুন'],
  ['navy', 'নেভি'],
  ['golden', 'sonali', 'সোনালি'],
];
const garmentGroups: string[][] = [
  ['kurti', 'kurta', 'কুর্তি', 'কুর্তা'],
  ['saree', 'sari', 'শাড়ি', 'শাড়ী'],
  ['panjabi', 'punjabi', 'পাঞ্জাবি', 'পাঞ্জাবী'],
  ['shirt', 'শার্ট'],
  ['pant', 'pants', 'trouser', 'প্যান্ট'],
  ['shoes', 'shoe', 'juta', 'joota', 'জুতা', 'জুতো'],
  ['bag', 'bags', 'ব্যাগ'],
  ['hijab', 'হিজাব'],
  ['borka', 'burqa', 'burka', 'বোরকা'],
  ['orna', 'scarf', 'ওড়না'],
  ['salwar', 'shalwar', 'সালোয়ার'],
  ['lehenga', 'লেহেঙ্গা'],
  ['dress', 'ড্রেস'],
  ['watch', 'ghori', 'ঘড়ি'],
];

const conceptByKey = new Map<string, string>();
const colourConcepts = new Set(colourGroups.map(([concept]) => concept!));
for (const [concept, ...members] of [...colourGroups, ...garmentGroups]) {
  for (const member of [concept!, ...members]) {
    const [word] = searchWords(member);
    conceptByKey.set(wordKey(word!), concept!);
  }
}

// Words about asking, not about the product. Dropped so "koto taka" does not count as a miss.
const askingWords = new Set(
  (
    'price dam daam dami koto kto kot taka takar tk size saiz ache ase achhe available stock ki kii er ta ti ' +
    'ekta ekti ei ami amar chai lagbe den dite dibo pabo jabe show send dekhan dekhao please plz pls ' +
    'the a an is are do you have in of for any me my i want need there with bhai apu apa sir ' +
    'দাম কত টাকা টাকার সাইজ টা টি আছে কি কী এই একটা একটি আমি আমার চাই লাগবে দেন দিন দেখান দেখাও দেখি পাওয়া যাবে ভাই আপু'
  ).split(' '),
);

const maxCues = new Set(
  ('under below within max upto niche nicher moddhe modhye kom ' + 'নিচে নিচের মধ্যে মাঝে কম').split(
    ' ',
  ),
);
const minCues = new Set('above over upore beshi বেশি উপরে ওপরে'.split(' '));
const poishaPerTaka = 100;
const cueDistance = 2;

export function parseQuery(text: string): ParsedQuery {
  const words = searchWords(text).filter((word) => !askingWords.has(word));
  const used = new Set<number>();
  let maxPricePoisha: number | null = null;
  let minPricePoisha: number | null = null;
  words.forEach((word, index) => {
    const isMax = maxCues.has(word);
    if (!isMax && !minCues.has(word)) return;
    // The amount sits next to the cue: "under 500", "৫০০ টাকার নিচে", "500 er moddhe".
    for (let step = 1; step <= cueDistance; step += 1) {
      const at = [index - step, index + step].find((spot) => /^\d+$/.test(words[spot] ?? ''));
      if (at === undefined || used.has(at)) continue;
      used.add(at);
      const amount = Number(words[at]) * poishaPerTaka;
      if (isMax) maxPricePoisha = amount;
      else minPricePoisha = amount;
      used.add(index);
      return;
    }
  });
  return {
    words: words.filter((word, index) => !used.has(index)),
    maxPricePoisha,
    minPricePoisha,
  };
}

export function fitsPrice(document: SearchDocument, query: ParsedQuery): boolean {
  return document.pricesPoisha.some(
    (price) =>
      (query.maxPricePoisha === null || price <= query.maxPricePoisha) &&
      (query.minPricePoisha === null || price >= query.minPricePoisha),
  );
}

type Field = {
  weight: number;
  words: { word: string; key: string; concept: string | undefined }[];
};

function fieldOf(weight: number, texts: (string | null)[]): Field {
  const words = texts.flatMap((text) => (text ? searchWords(text) : []));
  return {
    weight,
    words: words.map((word) => {
      const key = wordKey(word);
      return { word, key, concept: word.length >= 3 ? conceptByKey.get(key) : undefined };
    }),
  };
}

type Word = Field['words'][number];

// How well one query word matches one stored word, from 0 to 1.
function wordMatch(query: Word, stored: Word): number {
  if (query.word === stored.word) return 1;
  if (query.concept && query.concept === stored.concept) return 1;
  if (query.key.length < 2 || stored.key.length < 2) return 0;
  return keyMatch(query.key, stored.key);
}

function keyMatch(query: string, stored: string): number {
  if (query === stored) return 0.9;
  // "কুর্তির" is কুর্তি with the Bangla "of" ending; "kurtir" and "kurtite" do the same in Latin.
  if (stored.length >= 3 && query.length <= stored.length + 2 && query.startsWith(stored))
    return 0.8;
  if (query.length >= 4 && stored.length >= 4 && isWithinOneEdit(query, stored)) return 0.7;
  if (query.length >= 3 && stored.startsWith(query)) return 0.6;
  return 0;
}

// Share of the query words the product covers, weighting a hit in the name above one in the description.
export function lexicalScore(document: SearchDocument, words: string[]): number {
  if (!words.length) return 0;
  const fields = [
    fieldOf(1, [document.name]),
    fieldOf(1, document.aliases),
    fieldOf(0.8, [document.category]),
    fieldOf(0.6, document.optionValues),
    fieldOf(0.3, [document.description]),
  ];
  let total = 0;
  for (const word of words) {
    const [query] = fieldOf(1, [word]).words;
    if (!query) continue;
    let best = 0;
    for (const field of fields)
      for (const stored of field.words)
        best = Math.max(best, field.weight * wordMatch(query, stored));
    total += best;
  }
  return total / words.length;
}

export const minLexicalScore = 0.6;
const reciprocalRankOffset = 60;

// A product found by spelling and one found by meaning are ranked together; a product both find wins.
export function fuseRanks(lexicalIds: string[], embeddingIds: string[]): string[] {
  const scores = new Map<string, number>();
  for (const list of [lexicalIds, embeddingIds])
    list.forEach((id, rank) =>
      scores.set(id, (scores.get(id) ?? 0) + 1 / (reciprocalRankOffset + rank + 1)),
    );
  const lexicalRank = new Map(lexicalIds.map((id, rank) => [id, rank]));
  return [...scores.keys()].sort(
    (left, right) =>
      scores.get(right)! - scores.get(left)! ||
      (lexicalRank.get(left) ?? Infinity) - (lexicalRank.get(right) ?? Infinity) ||
      left.localeCompare(right),
  );
}

// Products that match the typed words and the price words, best first. Meaning-based hits are added by the caller.
export function rankByWords(documents: SearchDocument[], query: ParsedQuery): string[] {
  const priced = documents.filter((document) => fitsPrice(document, query));
  if (!query.words.length)
    return query.maxPricePoisha === null && query.minPricePoisha === null
      ? []
      : priced.map((document) => document.id);
  return priced
    .map((document) => ({ id: document.id, score: lexicalScore(document, query.words) }))
    .filter(({ score }) => score >= minLexicalScore)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

const identifyingMatch = 0.9;
const colourWeight = 0.3;

// How strongly a photo's words name each product. A word every shoe shares says little about which
// shoe it is, so its credit is split across the products it fits; a colour counts for less than a name.
export function nameScores(documents: SearchDocument[], words: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  const named = documents.map((document) => ({
    id: document.id,
    names: fieldOf(1, [document.name, ...document.aliases]),
    category: fieldOf(1, [document.category]),
  }));
  for (const word of words) {
    const [query] = fieldOf(1, [word]).words;
    if (!query) continue;
    const fits = (field: Field) =>
      field.words.some((stored) => wordMatch(query, stored) >= identifyingMatch);
    const sharing = named.filter(({ names, category }) => fits(names) || fits(category)).length;
    if (!sharing) continue;
    const credit =
      (query.concept && colourConcepts.has(query.concept) ? colourWeight : 1) / sharing;
    for (const { id, names } of named)
      if (fits(names)) scores.set(id, (scores.get(id) ?? 0) + credit);
  }
  return scores;
}
