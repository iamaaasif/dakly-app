import type { CommentIntent } from '@dakly/contracts/comments';

import { matchesAnyKeyword } from './message-keywords';

// Shoppers mix Bangla, Banglish and English in one comment, so each intent reads all three.
// Latin words match from the start of a word only, so "pp" does not match "ppl" and "dam" does
// not match "damage".
const startOfWord = '(?<![\\p{L}\\p{N}])';
const askingPrice = new RegExp(
  `${startOfWord}(?:price|da+m(?!age)|koto|kto|how much|p\\.?p(?![\\p{L}\\p{N}]))|দাম|মূল্য|প্রাইস|কত`,
  'iu',
);
const orderWords = [
  'order',
  'ordar',
  'oder',
  'nibo',
  'nebo',
  'kinbo',
  'lagbe',
  'chai',
  'অর্ডার',
  'নিব',
  'নেব',
  'কিনব',
  'লাগবে',
  'চাই',
];
const questionWords = [
  'ache',
  'available',
  'stock',
  'size',
  'color',
  'colour',
  'delivery',
  'details',
  'info',
  'inbox',
  'আছে',
  'সাইজ',
  'কালার',
  'ডেলিভারি',
  'ডিটেইলস',
  'ইনফো',
  'ইনবক্স',
];

// Emoji, links and bare punctuation carry nothing to answer, and links are mostly spam.
export function hasReadableWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text) && !/https?:\/\/|www\./iu.test(text);
}

export function commentIntents(text: string): CommentIntent[] {
  if (!hasReadableWords(text)) return [];
  const intents: CommentIntent[] = [];
  const asksPrice = askingPrice.test(text);
  if (asksPrice) intents.push('price');
  if (matchesAnyKeyword(text, orderWords)) intents.push('order');
  if (asksPrice || /[?？]/u.test(text) || matchesAnyKeyword(text, questionWords))
    intents.push('question');
  return intents;
}
