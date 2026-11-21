// Shoppers write the same word in Bangla script, in Latin letters, or misspelled. Every word is
// reduced to a short consonant key so "kurti", "kurtii" and "কুর্তি" all land on the same key.

const banglaDigits = '০১২৩৪৫৬৭৮৯';

const banglaConsonants: Record<string, string> = {
  ক: 'k',
  খ: 'k',
  গ: 'g',
  ঘ: 'g',
  ঙ: 'n',
  চ: 'c',
  ছ: 'c',
  জ: 'j',
  ঝ: 'j',
  ঞ: 'n',
  ট: 't',
  ঠ: 't',
  ড: 'd',
  ঢ: 'd',
  ণ: 'n',
  ত: 't',
  থ: 't',
  দ: 'd',
  ধ: 'd',
  ন: 'n',
  প: 'p',
  ফ: 'p',
  ব: 'b',
  ভ: 'b',
  ম: 'm',
  য: 'j',
  র: 'r',
  ল: 'l',
  শ: 's',
  ষ: 's',
  স: 's',
  ৎ: 't',
  'ং': 'n',
  'ঁ': '',
  'ঃ': '',
};

// Two letters that sound as one are folded first. Vowels, h, y and w leave no trace in the key.
const latinDigraphs: [string, string][] = [
  ['sh', 's'],
  ['ch', '\u0001'],
  ['kh', 'k'],
  ['gh', 'g'],
  ['th', 't'],
  ['dh', 'd'],
  ['ph', 'p'],
  ['bh', 'b'],
  ['jh', 'j'],
  ['ng', 'n'],
];
const latinSingles: Record<string, string> = { z: 'j', f: 'p', v: 'b', q: 'k', c: 'k', x: 'ks' };

export function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
}

// Splits into words in any script, keeping digits and dropping marks that carry no meaning.
export function searchWords(text: string): string[] {
  const cleaned = toAsciiDigits(text.normalize('NFKC'))
    .toLowerCase()
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return cleaned.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

export function wordKey(word: string): string {
  if (/^\p{N}+$/u.test(word)) return word;
  return /[\u0980-\u09ff]/.test(word) ? banglaKey(word) : latinKey(word);
}

function banglaKey(word: string): string {
  let key = '';
  // A dot under ড or ঢ makes the flap sound of r; under য, or in the ্য form, y is only a vowel.
  for (const letter of word
    .replace(/[ডঢ]\u09bc/g, 'র')
    .replace(/য\u09bc/g, '')
    .replace(/্য/g, '')) {
    if (Object.hasOwn(banglaConsonants, letter)) key += banglaConsonants[letter];
    else if (/[a-z]/.test(letter)) key += latinKey(letter);
  }
  return collapseRepeats(key);
}

function latinKey(word: string): string {
  let text = word;
  for (const [from, to] of latinDigraphs) text = text.replaceAll(from, to);
  let key = '';
  for (const letter of text) {
    if (letter === '\u0001') key += 'c';
    else if (Object.hasOwn(latinSingles, letter)) key += latinSingles[letter];
    else if (/[b-df-hj-np-tv-z]/.test(letter) && letter !== 'h' && letter !== 'y' && letter !== 'w')
      key += letter;
  }
  return collapseRepeats(key);
}

// "kurtti" and "kurti" are one word; a key that would shrink to a single letter keeps two.
function collapseRepeats(key: string): string {
  const collapsed = key.replace(/(.)\1+/g, '$1');
  return collapsed.length === 1 ? key.slice(0, 2) : collapsed;
}

// Edit distance of at most one: a typo shoppers make constantly on a phone keyboard.
export function isWithinOneEdit(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let start = 0;
  while (start < left.length && left[start] === right[start]) start += 1;
  const leftRest = left.slice(start);
  const rightRest = right.slice(start);
  if (left.length === right.length) return leftRest.slice(1) === rightRest.slice(1);
  const [longer, shorter] =
    leftRest.length > rightRest.length ? [leftRest, rightRest] : [rightRest, leftRest];
  return longer.slice(1) === shorter;
}
