const MAX_REPLY_LENGTH = 600;
const banglaDigits = '০১২৩৪৫৬৭৮৯';
const number = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const amountPatterns = [
  new RegExp(String.raw`৳\s*${number}`, 'giu'),
  new RegExp(String.raw`${number}\s*(?:৳|tk\b|taka\b|টাকা)`, 'giu'),
];
const stockWord = String.raw`(?:in stock|stock|available|আছে|ache|বাকি|baki|স্টক)`;
const stockPatterns = [
  new RegExp(
    String.raw`${number}\s*(?:pcs?|pieces?|units?|টি|টা|পিস|ta|ti)?\s*${stockWord}`,
    'giu',
  ),
  new RegExp(String.raw`(?:stock|available|স্টক|মজুদ)[^\d\n]{0,12}${number}`, 'giu'),
];
const phonePattern = /(?:\+?880|0)1[3-9](?:[\s-]?\d){8}/g;
const linkPattern =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|me|ly|link|bd|co|app|shop|xyz)\b\S*/giu;

export type FactCheckFailure = 'empty' | 'too_long' | 'amount' | 'stock' | 'phone' | 'link';

type Shop = { phone: string | null; linkBaseUrl: string };

export function checkReplyFacts(
  reply: string,
  toolResults: readonly unknown[],
  shop: Shop,
): { isSafe: true } | { isSafe: false; failure: FactCheckFailure } {
  const text = toAsciiDigits(reply);
  if (!text.trim()) return { isSafe: false, failure: 'empty' };
  if ([...text].length > MAX_REPLY_LENGTH) return { isSafe: false, failure: 'too_long' };
  if ((text.match(linkPattern) ?? []).some((link) => !link.startsWith(`${shop.linkBaseUrl}/`)))
    return { isSafe: false, failure: 'link' };
  const shopPhone = shop.phone && digitsOnly(shop.phone);
  if ((text.match(phonePattern) ?? []).some((phone) => digitsOnly(phone) !== shopPhone))
    return { isSafe: false, failure: 'phone' };
  const known = numbersIn(toolResults);
  if (claimedNumbers(text, amountPatterns).some((value) => !known.has(value)))
    return { isSafe: false, failure: 'amount' };
  if (claimedNumbers(text, stockPatterns).some((value) => !known.has(value)))
    return { isSafe: false, failure: 'stock' };
  return { isSafe: true };
}

function claimedNumbers(text: string, patterns: RegExp[]) {
  return patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => parseNumber(match[1]!)),
  );
}

// A number counts as known when any tool result holds it, as a value or inside text.
function numbersIn(value: unknown, found = new Set<number>()) {
  if (typeof value === 'number') found.add(value);
  else if (typeof value === 'string')
    for (const match of toAsciiDigits(value).matchAll(new RegExp(number, 'g')))
      found.add(parseNumber(match[1]!));
  else if (Array.isArray(value)) for (const item of value) numbersIn(item, found);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) numbersIn(item, found);
  return found;
}

const parseNumber = (digits: string) => Number(digits.replaceAll(',', ''));
const digitsOnly = (phone: string) => phone.replace(/\D/g, '').replace(/^880/, '0');
const toAsciiDigits = (text: string) =>
  text.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
