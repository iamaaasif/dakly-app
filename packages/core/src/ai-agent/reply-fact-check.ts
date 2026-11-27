import {
  amountPatterns,
  bareOfferPattern,
  type ClaimedAmount,
  hasWrongAmount,
  leaksInstructions,
  numberPattern,
  offerWords,
} from '@dakly/contracts/reply-wording';

import { quotedOfferRefs, type OfferQuote } from './offer-lower-price';

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
const deliveryWord = String.raw`(?:\b(?:delivery|shipping|courier)\b|ডেলিভারি|ডেলিভারী|কুরিয়ার|কুরিয়ার)`;
const deliveryChargePatterns = [
  new RegExp(
    String.raw`${deliveryWord}(?:\s+(?:charge|fee|cost|চার্জ|খরচ))?\s*(?:(?:is|হলো|হল)\s*)?[:=]?\s*৳?\s*${number}`,
    'giu',
  ),
  new RegExp(String.raw`${number}\s*(?:(?:tk|taka|টাকা)\s+)?(?:for\s+)?${deliveryWord}`, 'giu'),
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
  offerQuotes?: readonly OfferQuote[];
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
  if (
    hasIncorrectAmount(text, toolResults, {
      known,
      customerNumbers: numbersIn(customerTexts),
      offerQuotes: shop.offerQuotes ?? [],
    })
  )
    return { isSafe: false, failure: 'amount' };
  if (claimedNumbers(text, stockPatterns).some((value) => !known.has(value)))
    return { isSafe: false, failure: 'stock' };
  return { isSafe: true };
}

type NegotiationResult =
  | { kind: 'offered'; priceTaka: number }
  | { kind: 'fixed'; pricesTaka: number[] }
  | { kind: 'final' };

function isNegotiationResult(value: unknown): value is NegotiationResult {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  if (value.kind === 'final') return true;
  if (value.kind === 'fixed')
    return (
      'pricesTaka' in value &&
      Array.isArray(value.pricesTaka) &&
      value.pricesTaka.every((price) => typeof price === 'number')
    );
  return value.kind === 'offered' && 'priceTaka' in value && typeof value.priceTaka === 'number';
}

function hasIncorrectAmount(
  text: string,
  toolResults: readonly unknown[],
  {
    known,
    customerNumbers,
    offerQuotes,
  }: {
    known: ReadonlySet<number>;
    customerNumbers: ReadonlySet<number>;
    offerQuotes: readonly OfferQuote[];
  },
) {
  const amounts = claimedAmounts(text);
  const results = toolResults.filter(isNegotiationResult);
  if (!results.length) return hasWrongAmount(amounts, (value) => known.has(value), customerNumbers);
  amounts.push(...claimedAmounts(text, [bareOfferPattern]));
  return negotiationAmountIsWrong(text, amounts, results, {
    toolResults,
    customerNumbers,
    offerQuotes,
  });
}

function negotiationAmountIsWrong(
  text: string,
  amounts: readonly (ClaimedAmount & { at: number })[],
  results: readonly NegotiationResult[],
  {
    toolResults,
    customerNumbers,
    offerQuotes,
  }: {
    toolResults: readonly unknown[];
    customerNumbers: ReadonlySet<number>;
    offerQuotes: readonly OfferQuote[];
  },
) {
  const offered = new Set(
    results.flatMap((result) => (result.kind === 'offered' ? [result.priceTaka] : [])),
  );
  if (offered.size) {
    const delivery = claimedAmounts(text, deliveryChargePatterns);
    const deliveryPositions = new Set(delivery.map(({ at }) => at));
    const prices = amounts.filter(({ at }) => !deliveryPositions.has(at));
    const quoted = new Set(prices.map(({ value }) => Math.round(value * 100)));
    const charges = new Set(toolResults.flatMap(deliveryChargesIn));
    return (
      !prices.some(({ value }) => offered.has(value)) ||
      [...quotedOfferRefs(offerQuotes, quoted).values()].includes(null) ||
      delivery.some(({ value }) => !charges.has(value)) ||
      hasWrongAmount(prices, (value) => offered.has(value), customerNumbers)
    );
  }
  if (results.some(({ kind }) => kind === 'final')) return amounts.length > 0;
  const prices = new Set(
    results.flatMap((result) => (result.kind === 'fixed' ? result.pricesTaka : [])),
  );
  return amounts.some(({ value }) => !prices.has(value));
}

function deliveryChargesIn(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(deliveryChargesIn);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    (key === 'chargeTaka' || key === 'deliveryChargeTaka') && typeof item === 'number'
      ? [item]
      : deliveryChargesIn(item),
  );
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

function claimedAmounts(text: string, patterns = amountPatterns) {
  return patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({
      value: parseNumber(match[1]!),
      at: match.index + match[0].lastIndexOf(match[1]!),
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
