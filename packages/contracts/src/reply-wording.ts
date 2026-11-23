// Shared by the reply check and the eval, so both judge a reply by the same words.
// A discount, offer or percentage is never a tool result, so a reply that names one must have it
// in a shop's own policy text.
const offerPattern =
  /\d+(?:\.\d+)?\s*(?:%|percent|শতাংশ|পার্সেন্ট|শতকরা)\s*(?:off|discount|less|cheaper|ছাড়|ডিসকাউন্ট|কম)|\b(?:discount|off(?![\s-]*white)|free(?![\s-]*(?:size|সাইজ))|coupon|voucher|cashback|chhar)\b|ছাড়(?!া)|ডিসকাউন্ট|ফ্রি(?![\s-]*সাইজ)|ফ্রী(?![\s-]*সাইজ)|কুপন|ক্যাশব্যাক|বিনামূল্যে/giu;
// Words only these instructions and tool descriptions contain.
const leakPattern =
  /system prompt|my instructions|untrusted|hand_over|draft_order|confirm_order|search_products|get_product|search_knowledge|send_product_card|tool_results|product_candidates|<\/?(?:shop|conversation)\b|সিস্টেম প্রম্পট|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

// "ছাড় নেই", "discount dite parbo na" and "no discount" refuse an offer, so a reply that holds the
// price can name the word. A number with a percent is never treated as refused.
const refusedAfter = new RegExp(
  String.raw`^[\p{L}\p{M}]*(?:\s+(?:কোনো|দেওয়া|দেয়া|দিতে|দেওয়ার|দেবার|দেব|দেবো|দিব|দিবো|দিই|দেই|করা|যাবে|পারব|পারবো|পারছি|পারি|হবে|হয়|সম্ভব|সুযোগ|dewa|deya|deoa|dite|dibo|debo|dei|kora|jabe|parbo|parchi|pari|hobe|hoy|sombhob|sujog|possible))*\s+(?:না|নেই|নাই|na|nai|nei)(?![\p{L}\p{M}])(?!\s*(?:কেন|keno|ken)(?![\p{L}\p{M}]))`,
  'iu',
);
const refusedBefore =
  /(?:\bno|\bnot|\bcannot|n't|\bnever|\bwithout)(?:\s+(?:give|offer|have|provide|do|any|a|an|extra|further|more|other))*\s+$/iu;
const isRefused = (reply: string, start: number, word: string) =>
  !/^\d/.test(word) &&
  (refusedAfter.test(reply.slice(start + word.length, start + word.length + 60)) ||
    refusedBefore.test(reply.slice(Math.max(0, start - 40), start)));

export const leaksInstructions = (reply: string) => leakPattern.test(reply);
export const offerWords = (reply: string) =>
  [...reply.matchAll(offerPattern)]
    .filter((match) => !isRefused(reply, match.index, match[0]))
    .map((match) => match[0].toLowerCase());

// A customer's own budget may be repeated as a limit ("under 2000 taka"), never as a price.
const budgetPattern =
  /নিচে|নীচে|মধ্যে|কমে|পর্যন্ত|\b(?:under|below|within|upto|up to|less than|niche|moddhe|kome|porjonto)\b/iu;
export const isBudgetLimit = (wordsAroundAmount: string) => budgetPattern.test(wordsAroundAmount);

export type ClaimedAmount = { value: number; around: string };

// An amount is wrong unless a tool gave it. The customer's own budget is the one exception, and
// only when the reply quotes real prices that are all within it: "under 1000" next to a 1,200 price
// (or next to no price) would promise a price the shop never gave.
export function hasWrongAmount(
  amounts: readonly ClaimedAmount[],
  isKnown: (value: number) => boolean,
  customerNumbers: ReadonlySet<number>,
) {
  const isBudgetEcho = ({ value, around }: ClaimedAmount) =>
    !isKnown(value) && customerNumbers.has(value) && isBudgetLimit(around);
  const unknown = amounts.filter(({ value }) => !isKnown(value));
  if (unknown.some((amount) => !isBudgetEcho(amount))) return true;
  if (unknown.length === 0) return false;
  const quoted = amounts.filter(({ value }) => isKnown(value));
  const budget = Math.min(...unknown.map(({ value }) => value));
  return quoted.length === 0 || quoted.some(({ value }) => value > budget);
}

// A comma belongs to the number only between digits, so "size 41, ৳1500" holds 41 and 1500.
export const numberPattern = String.raw`(\d+(?:,\d+)*(?:\.\d+)?)`;
const number = numberPattern;
// Amounts and limits in a reply, with Bangla digits already turned into ASCII.
export const amountPatterns = [
  new RegExp(String.raw`৳\s*${number}`, 'giu'),
  new RegExp(String.raw`${number}\s*(?:৳|tk\b|taka[yr]?\b|টাকা)`, 'giu'),
  new RegExp(String.raw`\b(?:tk\.?|bdt|taka|rs\.?)\s*${number}`, 'giu'),
  // A limit with no currency word, such as "১০০০ এর মধ্যে" or "under 1000".
  new RegExp(String.raw`${number}\s*(?:এর|er)?\s*(?:মধ্যে|নিচে|moddhe|niche)`, 'giu'),
  new RegExp(String.raw`\b(?:under|below|within|up to)\s*${number}`, 'giu'),
];
