import { randomUUID } from 'node:crypto';

import type { SearchDocument } from '../../product-search/product-search-ranking';
import type { ChatProduct } from '../../products/products.service';

// The eval shop of golden-set.bangla.ts, as plain data. Aliases stand in for the names an owner
// adds to a product, and search matches them the way ProductsRepository.searchForChat does.
type EvalVariant = { variantId: string; title: string; priceTaka: number; stock: number };
type EvalPhoto = {
  photoId: string;
  key: string;
  description: string;
  tags: string[];
  variantId: string | null;
};
export type EvalProduct = {
  productId: string;
  name: string;
  category: string;
  description: string;
  aliases: string[];
  variants: EvalVariant[];
  photos: EvalPhoto[];
};

type ProductInput = Omit<EvalProduct, 'productId' | 'variants' | 'photos'> & {
  variants: [title: string, priceTaka: number, stock: number][];
  // Tagged photos as the vision tier would tag them: key, description and tags.
  // A fourth item names the variant the photo belongs to.
  photos?: [key: string, description: string, tags: string[], variantTitle?: string][];
};

const product = ({ variants, photos = [], ...fields }: ProductInput): EvalProduct => {
  const made = variants.map(([title, priceTaka, stock]) => ({
    variantId: randomUUID(),
    title,
    priceTaka,
    stock,
  }));
  return {
    ...fields,
    productId: randomUUID(),
    photos: photos.map(([key, description, tags, variantTitle]) => ({
      photoId: randomUUID(),
      key,
      description,
      tags,
      variantId: made.find(({ title }) => title === variantTitle)?.variantId ?? null,
    })),
    variants: made,
  };
};

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
    photos: [
      ['kurti-red', 'A red kurti with a white flower print.', ['red', 'লাল', 'kurti', 'কুর্তি']],
      ['kurti-blue', 'A blue plain cotton kurti.', ['blue', 'নীল', 'kurti', 'কুর্তি']],
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
  // Each colour is a variant with its own tagged photo; the black one has no stock.
  product({
    name: 'হ্যান্ডব্যাগ',
    category: 'ব্যাগ',
    description: 'মেয়েদের চামড়ার হ্যান্ডব্যাগ',
    aliases: ['handbag', 'hand bag'],
    variants: [
      ['লাল', 1800, 5],
      ['কালো', 1800, 0],
      ['নীল', 1800, 4],
    ],
    photos: [
      [
        'bag-red',
        'A red leather handbag with a gold clasp.',
        ['red', 'লাল', 'handbag', 'হ্যান্ডব্যাগ'],
        'লাল',
      ],
      [
        'bag-black',
        'A black leather handbag with a gold clasp.',
        ['black', 'কালো', 'handbag', 'হ্যান্ডব্যাগ'],
        'কালো',
      ],
      [
        'bag-blue',
        'A blue leather handbag with a long strap.',
        ['blue', 'নীল', 'handbag', 'হ্যান্ডব্যাগ'],
        'নীল',
      ],
    ],
  }),
  product({
    name: 'ডেনিম জ্যাকেট',
    category: 'ছেলেদের পোশাক',
    description: 'ডেনিম জ্যাকেট',
    aliases: ['denim jacket'],
    variants: [['L', 2400, 0]],
  }),
];

// Only Dhaka is a zone. The outside-Dhaka charge and days are in the shop's policy file, as in a
// shop that has not set up its other zones, so the model has to read the knowledge passage.
export const deliveryZones = [{ name: 'Dhaka', chargeTaka: 60, isDefault: true }];

export const deliveryPolicyPassage = {
  itemId: 'eval-delivery-policy',
  content:
    'Delivery inside Dhaka is ৳60 and takes 1-2 days. Outside Dhaka is ৳120 and takes 3-5 days.',
};

// Matches when any word of the query is in a product's name, alias or description. The shop's
// real search is an exact substring match until AI-10 adds fuzzy search; this stands in for it, so
// the run measures the model and not the search.
export function searchEvalProducts(
  query: string,
  limit: number,
  onlyProductIds?: readonly string[],
): EvalProduct[] {
  const words = query
    .toLowerCase()
    .split(/[\s,.?!।]+/u)
    .filter((word) => [...word].length >= MIN_WORD_LENGTH);
  return evalProducts
    .filter(({ productId }) => !onlyProductIds || onlyProductIds.includes(productId))
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
  photos,
}: EvalProduct) => ({
  productId,
  name,
  category,
  description,
  photos: photos.map(({ photoId, variantId, description: seen, tags }) => ({
    photoId,
    variantId,
    description: seen,
    tags,
  })),
  variants,
});

export const evalPhotoKey = (photoId: unknown) =>
  evalProducts.flatMap(({ photos }) => photos).find((photo) => photo.photoId === photoId)?.key ??
  null;

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
  stockStatus: 'in_stock',
  allowOrdersWhenOutOfStock: false,
  description: item.description,
  category: item.category,
  photos: item.photos.map(({ photoId, variantId, description, tags }) => ({
    id: photoId,
    variantId,
    description,
    tags,
  })),
  variants: item.variants.map((variant, index) => ({
    id: variant.variantId,
    title: variant.title,
    isDefault: index === 0,
    pricePoisha: variant.priceTaka * 100,
    available: variant.stock,
    photoUrl: null,
    photoFileId: null,
  })),
}));
