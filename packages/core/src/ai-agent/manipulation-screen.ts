import type { handoverReasons } from '@dakly/contracts/chats';
import { toAsciiDigits } from '@dakly/contracts/digits';
import { takaInput } from '@dakly/contracts/products';
import { amountPatterns } from '@dakly/contracts/reply-wording';

import type { ConversationEntry } from './chat-memory';

type Reason = (typeof handoverReasons)[number];

// Words that try to change the assistant's rules or role, or to learn its instructions.
const manipulationPatterns: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?|restrictions?|policy|policies)\b/u,
  /\b(system|developer|hidden|initial|original)\s+(prompt|message|instructions?)\b/u,
  /\b(reveal|show|print|repeat|tell me|give me)\b.{0,30}\b(your|system|above|previous|original|hidden)\s+(prompt|instructions?|rules)\b/u,
  /\b(you are now|from now on you|act as|pretend (to be|you are)|role-?play|jailbreak|developer mode|admin mode|dan mode|new instructions?)\b/u,
  /\b(i am|i'm|this is|im)\s+(the\s+|your\s+)?(owner|admin|manager|developer|boss|ceo)\b/u,
  /\b(owner|manager|admin|boss) (said|told|approved|allowed|authori[sz]ed)\b/u,
  /\b(set|change|make|mark|update)\b.{0,20}\bprice\b.{0,20}\b(to|as|at)\b/u,
  /\bager\b.{0,20}\b(instruction|nirdesh|rules?|prompt)\b/u,
  /\b(instruction|prompt|rules?)\b.{0,20}\b(ignore|bhule|bad dao|dekhao|bolo|bolen)\b/u,
  /\btumi ekhon (theke|ekjon|ekta|hole|amar)\b|\bsystem prompt\b|\bowner ami\b|\bami (owner|admin|malik)\b/u,
  /\b(malik|owner) (ne |e )?(bolse|bolechhe|bolechen|bolsen|allow|permission)\b/u,
  /\bdam\b.{0,15}\b(0|zero|shunno|free)\b.{0,10}\b(kor|koro|korun|kore dao)\b/u,
  /আগের.{0,15}(নির্দেশ|নির্দেশনা|ইনস্ট্রাকশন|নিয়ম).{0,20}(ভুলে|বাদ|উপেক্ষা|মানবে না|মানবেন না)/u,
  /(সিস্টেম|ডেভেলপার).{0,5}(প্রম্পট|মেসেজ|ইনস্ট্রাকশন)|প্রম্পট.{0,20}(দেখাও|দেখান|বলো|বলুন)/u,
  /(তুমি|আপনি) এখন (থেকে|একজন|একটা|হলে|আমার)|ভান কর|রোল ?প্লে/u,
  /(আমি|আমিই).{0,6}(মালিক|অ্যাডমিন|এডমিন|ম্যানেজার|ডেভেলপার)|মালিক.{0,10}(বলেছে|বলেছেন|অনুমতি)/u,
  /দাম.{0,10}(০|শূন্য|ফ্রি|ফ্রী).{0,10}(কর|করে)/u,
];

// The discount screen also covers coupons, free items and delivery.
const discountPatterns: RegExp[] = [
  /\b(discount|bargain|lower price|last price|final price|lowest price|best price|coupon|promo code|cashback)\b/u,
  /\b\d{1,3}\s*%\s*(off|discount)\b|\b(half|50) ?(price|off)\b|\bfor free\b|\bfree of charge\b/u,
  /\b(chhar|chhaar|dam kom|dam ektu kom|kom koren|kom korun|komer moddhe|kome den|kome dite|price kom|dam komao|free te|freete)\b/u,
  /\bkom (hobe|hoy|rakhen|rakha|korben|korte|den|dile)\b/u,
  /ছাড়(?!া)|ডিসকাউন্ট|দাম কম|দাম কমান|কমে দিন|কমে হবে|কম হবে|কম হয়|কম রাখেন|কম করেন|ফ্রিতে|বিনামূল্যে|দর ?কষা/u,
];

export type DiscountScreen = {
  // On, every discount ask goes to a person. Off, the shop can use its saved product offer.
  handOverDiscounts: boolean;
  // Messages earlier in the same chat, before this burst, oldest first.
  earlier: readonly ConversationEntry[];
};

const discountDeclinedPattern =
  /\b(?:no|without|don'?t need|dont need)\s+(?:a\s+|any\s+)?discount\b|\bdiscount\s+(?:lagbe na|chai na|charai|chara)\b|ছাড়\s*(?:লাগবে না|চাই না|ছাড়াই)/u;

// Only phrases about the price or a discount: a shop saying "we cannot deliver today" is no refusal.
const finalPricePattern =
  /\b(?:price is final|final price|last price|dam (?:shesh|final)|(?:shesh|final) dam)\b|শেষ দাম|দাম(?:টাই|ই|টি)?\s+(?:শেষ|চূড়ান্ত)|চূড়ান্ত দাম/u;

const shopRefusalPattern =
  /\b(?:fixed|no discount|cannot (?:give|offer|reduce)|can't (?:give|offer|reduce))\b|নির্ধারিত|ফিক্সড|ছাড় নেই|ছাড় দেওয়া|কমানো যাবে না|komano jabe na|chhar nei|dam fixed/u;

// Runs before any model call, so an attack costs no tokens and cannot talk the model round.
export function screenCustomerTexts(
  texts: readonly string[],
  discounts: DiscountScreen,
): Reason | null {
  const text = normalize(texts.join('\n'));
  if (manipulationPatterns.some((pattern) => pattern.test(text))) return 'other';
  if (!isDiscountRequest(texts.at(-1))) return null;
  if (discounts.handOverDiscounts) return 'discount';
  const firstAsk = discounts.earlier.findIndex(
    ({ from, text }) => from === 'customer' && isDiscountRequest(text),
  );
  if (firstAsk === -1) return null;
  // A repeat ask goes to a person only once the shop has refused after the first ask.
  const refused = discounts.earlier
    .slice(firstAsk + 1)
    .some(({ from, text }) => from === 'shop' && refusedDiscount(normalize(text)));
  return refused ? 'discount' : null;
}

function refusedDiscount(text: string) {
  const final = text
    .split(/\n|[!?।]|[.,]\s+|\s+(?:and|with|plus|আর|এবং)\s+/u)
    .filter((clause) => finalPricePattern.test(clause));
  if (!final.length) return shopRefusalPattern.test(text);
  return final.some((clause) => quotedPricesPoisha(clause).size === 0);
}

const asksForDiscount = (text: string) => discountPatterns.some((pattern) => pattern.test(text));

export function isDiscountRequest(text: string | undefined): boolean {
  const normalized = normalize(text ?? '');
  return (
    !discountDeclinedPattern.test(normalized) &&
    (asksForDiscount(normalized) || isCounteroffer(normalized))
  );
}

const deliveryWords =
  /\b(?:deliver|delivery|shipping|ship|courier|postage)\b|ডেলিভারি|ডেলিভারী|কুরিয়ার|কুরিয়ার/u;

export function productDiscountRequest(text: string): string | undefined {
  const normalized = normalize(text);
  if (!deliveryWords.test(normalized))
    return isDiscountRequest(normalized) ? normalized : undefined;
  return normalized
    .split(/\s+(?:and|with|plus|আর|এবং)\s+|[,;?!]\s+/u)
    .find((part) => !deliveryWords.test(part) && isDiscountRequest(part));
}

const counterofferWords =
  /\b(?:can you do|could you do|can i pay|would you take|would you accept|taka e dite|takay hobe)\b|টাকায় হবে|টাকায় হবে/u;
const isCounteroffer = (text: string) =>
  counterofferWords.test(text) && requestedDiscountPoisha(text) !== undefined;

export function quotedPricesPoisha(text: string, patterns = amountPatterns) {
  const digits = toAsciiDigits(normalize(text));
  return new Set(
    patterns.flatMap((pattern) =>
      [...digits.matchAll(pattern)].map(
        ([, value]) => takaInput.safeParse(value?.replaceAll(',', '')).data,
      ),
    ),
  );
}

export function requestedDiscountPoisha(text: string): number | undefined {
  const amounts = quotedPricesPoisha(text);
  return amounts.size === 1 ? [...amounts][0] : undefined;
}

// Zero-width characters and spaced-out letters are the usual ways to slip a phrase past a filter.
function normalize(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/[_*`~|]+/g, ' ')
    .replace(/\s+/g, ' ');
}
