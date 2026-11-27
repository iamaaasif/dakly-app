import { toAsciiDigits } from '../digits';

const currency = /[৳$]|(?<![\p{L}\p{N}])(?:tk|taka|bdt|usd)(?![\p{L}\p{N}])|টাকা/iu;
const link = /https?:\/\/|www\.|\.(?:com|net|me|bd)(?![\p{L}\p{N}])/iu;

// A public reply is read by everyone, so it never holds a price, a phone number, an address number
// or a link. Prices go only by private reply or DM, from the catalogue.
export function publicReplyProblem(text: string): string | undefined {
  if (/\d/u.test(toAsciiDigits(text))) return 'A public reply cannot hold numbers';
  if (currency.test(text)) return 'A public reply cannot name a price';
  if (link.test(text)) return 'A public reply cannot hold a link';
}

// Typed prices go stale, so a private reply gets its price from the product card instead.
export function privateReplyProblem(text: string): string | undefined {
  if (currency.test(text)) return 'Write no price here; turn on the product card to send the price';
}
