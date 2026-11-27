import { toAsciiDigits } from '@dakly/contracts/digits';

const normalise = (text: string) => toAsciiDigits(text.normalize('NFC').toLowerCase());

// Bangla words take endings ("দামটা"), so they match anywhere in the message. Banglish and English
// match from the start of a word, so "dam" finds "damta" but not "adam".
export function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const message = normalise(text);
  return keywords.some((keyword) => {
    const wanted = normalise(keyword.trim());
    if (!wanted) return false;
    if (/[ঀ-৿]/u.test(wanted)) return message.includes(wanted);
    const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escaped}`, 'u').test(message);
  });
}
