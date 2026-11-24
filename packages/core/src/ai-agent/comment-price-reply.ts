import { formatMoney } from '@dakly/contracts/money';

import type { ChatProduct } from '../products/products.service';

const priceQuestions = {
  bangla: /^(?:দাম|মূল্য|প্রাইস) ?(?:কত|কতো|জানাবেন|please)?$|^(?:কত|কতো) দাম$/u,
  banglish: /^(?:(?:price|dam|daam) (?:koto|koto hobe|bolben|janaben)|koto (?:dam|daam|price))$/u,
  english: /^(?:price(?: please)?|how much(?: is (?:it|this|that))?|what is the price)$/u,
};
type Language = keyof typeof priceQuestions;
type PriceProduct = Pick<ChatProduct, 'name' | 'isStockTracked'> & {
  variants: Pick<ChatProduct['variants'][number], 'pricePoisha' | 'available'>[];
};

export function priceQuestion(text: string): Language | undefined {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[?!।]+$/u, '')
    .trim();
  return (Object.keys(priceQuestions) as Language[]).find((language) =>
    priceQuestions[language].test(normalized),
  );
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
