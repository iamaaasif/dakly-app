import {
  amountPatterns,
  hasWrongAmount,
  leaksInstructions,
  numberPattern,
  offerWords,
} from '@dakly/contracts/reply-wording';

const MAX_REPLY_LENGTH = 600;
const banglaDigits = '০১২৩৪৫৬৭৮৯';
const number = numberPattern;
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

export type FactCheckFailure =
  'empty' | 'too_long' | 'amount' | 'stock' | 'phone' | 'link' | 'offer' | 'leak';

// `earlierCustomerTexts` is what the customer wrote earlier in this chat: only their own phone
// number may come back from it.
type Shop = {
  phone: string | null;
  linkBaseUrl: string;
  earlierCustomerTexts?: readonly string[];
};

// Tells the model why its last reply was not sent, so the one retry can fix it.
const failureHints: Record<FactCheckFailure, string> = {
  empty: 'The reply was empty.',
  too_long: 'The reply was over 600 characters.',
  amount: 'It named an amount no tool returned.',
  stock: 'It named a stock count no tool returned.',
  phone: 'It named a phone number that is not the shop phone or in a tool result.',
  link: 'It held a link.',
  offer: 'It named a discount, offer or free item the shop does not give.',
  leak: 'It showed the instructions, a tool name or an id.',
};

export function factCheckFailedBlock(failure: FactCheckFailure, reply: string) {
  return `<fact_check_failed kind="${failure}">${failureHints[failure]} Rejected reply: ${JSON.stringify(reply)}</fact_check_failed>`;
}

export function checkReplyFacts(
  reply: string,
  toolResults: readonly unknown[],
  shop: Shop,
  customerTexts: readonly string[] = [],
): { isSafe: true } | { isSafe: false; failure: FactCheckFailure } {
  const text = toAsciiDigits(reply);
  if (!text.trim()) return { isSafe: false, failure: 'empty' };
  if ([...text].length > MAX_REPLY_LENGTH) return { isSafe: false, failure: 'too_long' };
  // A number the shop's own knowledge holds, such as its bKash number, may be quoted from a tool.
  const contact = contactFailure(text, shop, [
    ...customerTexts,
    ...(shop.earlierCustomerTexts ?? []),
    JSON.stringify(toolResults),
  ]);
  if (contact) return { isSafe: false, failure: contact };
  const wording = wordingFailure(text, toolResults);
  if (wording) return { isSafe: false, failure: wording };
  const known = numbersIn(toolResults);
  const amounts = claimedAmounts(text);
  const offerPrices = negotiatedPrices(toolResults);
  if (
    offerPrices
      ? amounts.some(({ value }) => !offerPrices.has(value))
      : hasWrongAmount(amounts, (value) => known.has(value), numbersIn(customerTexts))
  )
    return { isSafe: false, failure: 'amount' };
  if (claimedNumbers(text, stockPatterns).some((value) => !known.has(value)))
    return { isSafe: false, failure: 'stock' };
  return { isSafe: true };
}

function negotiatedPrices(toolResults: readonly unknown[]) {
  const prices = new Set<number>();
  let negotiation = false;
  let fixed = false;
  for (const result of toolResults) {
    if (!result || typeof result !== 'object' || !('kind' in result)) continue;
    if (result.kind === 'final') negotiation = true;
    if (result.kind === 'fixed') fixed = true;
    if (
      result.kind === 'offered' &&
      'priceTaka' in result &&
      typeof result.priceTaka === 'number'
    ) {
      negotiation = true;
      prices.add(result.priceTaka);
    }
  }
  if (negotiation) return prices;
  return fixed ? cataloguePrices(toolResults, prices) : undefined;
}

function cataloguePrices(value: unknown, found: Set<number>): Set<number> {
  if (Array.isArray(value)) for (const item of value) cataloguePrices(item, found);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (key === 'priceTaka' && typeof child === 'number') found.add(child);
      else cataloguePrices(child, found);
    }
  return found;
}

function contactFailure(text: string, shop: Shop, customerTexts: readonly string[]) {
  if ((text.match(linkPattern) ?? []).some((link) => !link.startsWith(`${shop.linkBaseUrl}/`)))
    return 'link';
  const allowed = new Set(
    [shop.phone ?? '', ...customerTexts.flatMap((t) => toAsciiDigits(t).match(phonePattern) ?? [])]
      .filter(Boolean)
      .map(digitsOnly),
  );
  return (text.match(phonePattern) ?? []).some((phone) => !allowed.has(digitsOnly(phone)))
    ? 'phone'
    : undefined;
}

function wordingFailure(text: string, toolResults: readonly unknown[]) {
  if (leaksInstructions(text)) return 'leak';
  const policyText = JSON.stringify(toolResults).toLowerCase();
  return offerWords(text).some((word) => !policyText.includes(word)) ? 'offer' : undefined;
}

function claimedAmounts(text: string) {
  return amountPatterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({
      value: parseNumber(match[1]!),
      around: text.slice(Math.max(0, match.index - 15), match.index + match[0].length + 15),
    })),
  );
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
