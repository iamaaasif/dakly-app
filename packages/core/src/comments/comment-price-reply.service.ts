import { formatMoney } from '@dakly/contracts/money';

import type { ChatProduct } from '../products/products.service';

// Both scripts share one word list because shoppers mix them in a single comment.
const price = '(?:price|dam|daam|দাম|মূল্য|প্রাইস)';
const ask = '(?:koto|kto|কত|কতো)';
const taka = '(?:taka|টাকা)';
const filler = '(?:hobe|হবে|bolben|janaben|বলবেন|জানাবেন|please|pls|plz)';
const address = '(?:vai|bhai|bhaiya|apu|apa|ভাই|ভাইয়া|আপু|আপা)';
const mixedPriceQuestion = new RegExp(
  `^(?:${price}(?: ${ask})?(?: ${taka})?|${ask} (?:${price}|${taka}))(?: ${filler})?(?: ${address})?$`,
  'u',
);
const englishPriceQuestion =
  /^(?:price(?: please| pls| plz)?|pp|p\.p|how much(?: is (?:it|this|that))?|what is the price)$/u;
type Language = 'bangla' | 'banglish' | 'english';
export type CommentLanguage = Language;
type PriceProduct = Pick<ChatProduct, 'name' | 'isStockTracked'> & {
  variants: Pick<ChatProduct['variants'][number], 'pricePoisha' | 'available'>[];
};

export function replyLanguageFor(detected: Language, setting: 'match_customer' | 'bn' | 'en') {
  return { match_customer: detected, bn: 'bangla', en: 'english' }[setting] as Language;
}

export function priceQuestion(text: string): Language | undefined {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[?!।.]+$/u, '')
    .trim();
  if (englishPriceQuestion.test(normalized)) return 'english';
  if (!mixedPriceQuestion.test(normalized)) return;
  return /[a-z]/u.test(normalized) ? 'banglish' : 'bangla';
}

// For text that is more than a bare price question, such as "ami nibo, dam koto vai".
export function commentLanguage(text: string): Language {
  if (/[ঀ-৿]/u.test(text)) return 'bangla';
  return /(?<![a-z])(?:dam|daam|koto|kto|ami|nibo|lagbe|bhai|vai)(?![a-z])/iu.test(text)
    ? 'banglish'
    : 'english';
}

export const publicPriceAcknowledgement = {
  bangla: 'মেসেঞ্জারে দাম জানিয়েছি।',
  banglish: 'Messenger e dam janiyechi.',
  english: 'I sent the price in Messenger.',
} satisfies Record<Language, string>;

export function commentPriceReply(language: Language, product: PriceProduct) {
  const available = product.variants.filter(
    (variant) => !product.isStockTracked || variant.available > 0,
  );
  const prices = new Set(available.map(({ pricePoisha }) => pricePoisha));
  const price = available[0]?.pricePoisha;
  if (prices.size !== 1 || !price || price < 0) return;
  const amount = formatMoney(price);
  const privateMessages = {
    bangla: `${product.name} এর দাম ${amount}।`,
    banglish: `${product.name} er dam ${amount}.`,
    english: `${product.name} costs ${amount}.`,
  };
  return {
    privateBody: privateMessages[language],
    publicBody: publicPriceAcknowledgement[language],
  };
}
