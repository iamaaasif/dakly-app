import type { handoverReasons } from '@dakly/contracts/chats';

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

// A customer asking for a lower price is a request only a person may grant.
const discountPatterns: RegExp[] = [
  /\b(discount|bargain|last price|final price|lowest price|best price|coupon|promo code|cashback)\b/u,
  /\b\d{1,3}\s*%\s*(off|discount)\b|\b(half|50) ?(price|off)\b|\bfor free\b|\bfree of charge\b/u,
  /\b(chhar|chhaar|dam kom|dam ektu kom|kom koren|kom korun|komer moddhe|kome den|kome dite|price kom|dam komao|free te|freete)\b/u,
  /\bkom (hobe|hoy|rakhen|rakha|korben|korte|den|dile)\b/u,
  /ছাড়(?!া)|ডিসকাউন্ট|দাম কম|দাম কমান|কমে দিন|কমে হবে|কম হবে|কম হয়|কম রাখেন|কম করেন|ফ্রিতে|বিনামূল্যে|দর ?কষা/u,
];

export type DiscountScreen = {
  // On, every discount ask goes to a person. Off, the model holds the price once and a repeat ask
  // goes to a person.
  handOverDiscounts: boolean;
  // Customer messages earlier in the same chat, before this burst.
  earlierTexts: readonly string[];
  // Shop messages earlier in the same chat, used to confirm the shop already refused a discount.
  earlierShopTexts?: readonly string[];
};

const discountDeclinedPattern =
  /\b(?:no|without|don'?t need|dont need)\s+(?:a\s+|any\s+)?discount\b|\bdiscount\s+(?:lagbe na|chai na|charai|chara)\b|ছাড়\s*(?:লাগবে না|চাই না|ছাড়াই)/u;

const shopRefusalPattern =
  /\b(?:fixed|no discount|cannot|can't)\b|নির্ধারিত|ফিক্সড|ছাড় নেই|ছাড় দেওয়া|কমানো যাবে না|komano jabe na|chhar nei|dam fixed/u;

// Runs before any model call, so an attack costs no tokens and cannot talk the model round.
export function screenCustomerTexts(
  texts: readonly string[],
  discounts: DiscountScreen,
): Reason | null {
  const text = normalize(texts.join('\n'));
  if (manipulationPatterns.some((pattern) => pattern.test(text))) return 'other';
  const latest = normalize(texts.at(-1) ?? '');
  if (!asksForDiscount(latest) || discountDeclinedPattern.test(latest)) return null;
  if (discounts.handOverDiscounts) return 'discount';
  const askedBefore = asksForDiscount(normalize(discounts.earlierTexts.join('\n')));
  if (!askedBefore) return null;
  if (discounts.earlierShopTexts) {
    return shopRefusalPattern.test(normalize(discounts.earlierShopTexts.join('\n')))
      ? 'discount'
      : null;
  }
  return 'discount';
}

const asksForDiscount = (text: string) => discountPatterns.some((pattern) => pattern.test(text));

// Zero-width characters and spaced-out letters are the usual ways to slip a phrase past a filter.
function normalize(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/[_*`~|]+/g, ' ')
    .replace(/\s+/g, ' ');
}
