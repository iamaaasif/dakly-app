import { randomUUID } from 'node:crypto';

import type { SearchDocument } from '../../product-search/product-search-ranking';
import type { ChatProduct } from '../../products/products.service';

// The eval shop of golden-set.bangla.ts, as plain data. Aliases stand in for the names an owner
// adds to a product, and search matches them the way ProductsRepository.searchForChat does.
type EvalVariant = { variantId: string; title: string; priceTaka: number; stock: number };
export type EvalProduct = {
  productId: string;
  name: string;
  category: string;
  description: string;
  aliases: string[];
  variants: EvalVariant[];
};

type ProductInput = Omit<EvalProduct, 'productId' | 'variants'> & {
  variants: [title: string, priceTaka: number, stock: number][];
};

const product = ({ variants, ...fields }: ProductInput): EvalProduct => ({
  ...fields,
  productId: randomUUID(),
  variants: variants.map(([title, priceTaka, stock]) => ({
    variantId: randomUUID(),
    title,
    priceTaka,
    stock,
  })),
});

const MIN_WORD_LENGTH = 3;

export const evalShop = { name: 'রূপা ফ্যাশন', phone: '01712345678', district: 'Dhaka' };

export const evalProducts: EvalProduct[] = [
  product({
    name: 'কুর্তি',
    category: 'মেয়েদের পোশাক',
    description: 'লাল রঙের কুর্তি, সাদা ফুলের নকশা',
    aliases: ['kurti', 'kurtee'],
    variants: [
      ['M', 1450, 12],
      ['L', 1450, 8],
    ],
  }),
  product({
    name: 'লাল পাঞ্জাবি',
    category: 'ছেলেদের পোশাক',
    description: 'লাল সুতির পাঞ্জাবি',
    aliases: ['panjabi', 'punjabi', 'lal panjabi'],
    variants: [
      ['M', 1200, 6],
      ['L', 1200, 4],
    ],
  }),
  product({
    name: 'শাড়ি',
    category: 'মেয়েদের পোশাক',
    description: 'জামদানি স্টাইল শাড়ি',
    aliases: ['saree', 'sharee', 'sari'],
    variants: [['Free', 2800, 5]],
  }),
  product({
    name: 'থ্রি পিস',
    category: 'মেয়েদের পোশাক',
    description: 'কটন থ্রি পিস সেট',
    aliases: ['three piece', 'thri pis'],
    variants: [['M', 2200, 7]],
  }),
  product({
    name: 'পোলো শার্ট',
    category: 'ছেলেদের পোশাক',
    description: 'কটন পোলো শার্ট',
    aliases: ['polo shirt', 'polo'],
    variants: [
      ['M', 650, 10],
      ['L', 650, 9],
      ['XL', 650, 0],
    ],
  }),
  product({
    name: 'ক্যানভাস জুতা',
    category: 'জুতা',
    description: 'আরামদায়ক ক্যানভাস জুতা',
    aliases: ['canvas shoes', 'canvas jutha'],
    variants: [['41', 1500, 6]],
  }),
  product({
    name: 'স্নিকার্স',
    category: 'জুতা',
    description: 'স্পোর্টস স্নিকার্স জুতা',
    aliases: ['sneakers'],
    variants: [['41', 1800, 0]],
  }),
  product({
    name: 'লোফার',
    category: 'জুতা',
    description: 'চামড়ার লোফার জুতা',
    aliases: ['loafer'],
    variants: [['41', 2100, 0]],
  }),
  product({
    name: 'ডেনিম জ্যাকেট',
    category: 'ছেলেদের পোশাক',
    description: 'ডেনিম জ্যাকেট',
    aliases: ['denim jacket'],
    variants: [['L', 2400, 0]],
  }),
];

export const deliveryZones = [
  { name: 'Dhaka', chargeTaka: 60, isDefault: true },
  { name: 'Outside Dhaka', chargeTaka: 120, isDefault: false },
];

// Matches when any word of the query is in a product's name, alias or description. The shop's
// real search is an exact substring match until AI-10 adds fuzzy search; this stands in for it, so
// the run measures the model and not the search.
export function searchEvalProducts(query: string, limit: number): EvalProduct[] {
  const words = query
    .toLowerCase()
    .split(/[\s,.?!।]+/u)
    .filter((word) => [...word].length >= MIN_WORD_LENGTH);
  return evalProducts
    .filter(({ name, aliases, description }) => {
      const text = [name, description, ...aliases].join(' ').toLowerCase();
      return words.some((word) => text.includes(word));
    })
    .slice(0, limit);
}

export const productResult = ({
  productId,
  name,
  category,
  description,
  variants,
}: EvalProduct) => ({ productId, name, category, description, variants });

// The eval shop in the shapes the photo match reads.
export const evalSearchDocuments: SearchDocument[] = evalProducts.map((item) => ({
  id: item.productId,
  name: item.name,
  aliases: item.aliases,
  category: item.category,
  description: item.description,
  optionValues: item.variants.map(({ title }) => title),
  pricesPoisha: item.variants.map(({ priceTaka }) => priceTaka * 100),
}));

export const evalChatProducts: ChatProduct[] = evalProducts.map((item) => ({
  id: item.productId,
  name: item.name,
  isStockTracked: true,
  description: item.description,
  category: item.category,
  variants: item.variants.map((variant, index) => ({
    id: variant.variantId,
    title: variant.title,
    isDefault: index === 0,
    pricePoisha: variant.priceTaka * 100,
    available: variant.stock,
  })),
}));
