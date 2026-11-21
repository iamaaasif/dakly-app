import type { SearchDocument } from './product-search-ranking';

const taka = 100;

function product(
  id: string,
  name: string,
  fields: Partial<Omit<SearchDocument, 'id' | 'name'>> = {},
): SearchDocument {
  return {
    id,
    name,
    aliases: [],
    category: null,
    description: null,
    optionValues: [],
    pricesPoisha: [1000 * taka],
    ...fields,
  };
}

export const evalCatalogue: SearchDocument[] = [
  product('kurti-cotton', 'Cotton Kurti', {
    aliases: ['কুর্তি', 'kurti', 'three piece'],
    category: 'Women',
    optionValues: ['Red', 'Blue', 'M', 'L'],
    pricesPoisha: [1450 * taka],
  }),
  product('saree-jamdani', 'জামদানি শাড়ি', {
    aliases: ['saree', 'sari', 'jamdani'],
    category: 'Saree',
    pricesPoisha: [4800 * taka],
  }),
  product('panjabi-red', 'Red Panjabi', {
    aliases: ['পাঞ্জাবি', 'lal panjabi'],
    category: 'Men',
    optionValues: ['M', 'L', 'XL'],
    pricesPoisha: [1200 * taka],
  }),
  product('panjabi-white', 'সাদা পাঞ্জাবি', {
    aliases: ['white panjabi', 'sada punjabi'],
    category: 'Men',
    pricesPoisha: [1600 * taka],
  }),
  product('shirt-formal', 'Formal Shirt', {
    aliases: ['শার্ট', 'shart'],
    category: 'Men',
    pricesPoisha: [950 * taka],
  }),
  product('jeans-slim', 'Slim Fit Jeans', {
    aliases: ['জিন্স প্যান্ট', 'jeans pant'],
    category: 'Men',
    pricesPoisha: [1800 * taka],
  }),
  product('bag-leather', 'চামড়ার ব্যাগ', {
    aliases: ['leather bag', 'chamra bag', 'handbag'],
    category: 'Bags',
    pricesPoisha: [2200 * taka],
  }),
  product('shoes-sneaker', 'Canvas Sneakers', {
    aliases: ['জুতা', 'juta', 'shoes'],
    category: 'Shoes',
    optionValues: ['40', '41', '42'],
    pricesPoisha: [1300 * taka],
  }),
  product('hijab-chiffon', 'Chiffon Hijab', {
    aliases: ['হিজাব', 'hijab'],
    category: 'Women',
    optionValues: ['Black', 'Navy'],
    pricesPoisha: [450 * taka],
  }),
  product('borka-abaya', 'Abaya Borka', {
    aliases: ['বোরকা', 'burqa'],
    category: 'Women',
    pricesPoisha: [2900 * taka],
  }),
  product('watch-men', 'Men Wrist Watch', {
    aliases: ['ঘড়ি', 'ghori'],
    category: 'Accessories',
    pricesPoisha: [3200 * taka],
  }),
  product('orna-silk', 'সিল্ক ওড়না', {
    aliases: ['orna', 'scarf'],
    category: 'Women',
    pricesPoisha: [600 * taka],
  }),
];

export type EvalQuery = {
  language: 'bangla' | 'banglish' | 'english' | 'mixed';
  text: string;
  // The product that must come first; null when nothing in the catalogue fits.
  expectedFirst: string | null;
};

export const evalQueries: EvalQuery[] = [
  { language: 'english', text: 'do you have kurti', expectedFirst: 'kurti-cotton' },
  { language: 'banglish', text: 'kurti ache?', expectedFirst: 'kurti-cotton' },
  { language: 'banglish', text: 'kurtii koto taka', expectedFirst: 'kurti-cotton' },
  { language: 'bangla', text: 'কুর্তি আছে?', expectedFirst: 'kurti-cotton' },
  { language: 'bangla', text: 'কুর্তির দাম কত', expectedFirst: 'kurti-cotton' },
  { language: 'mixed', text: 'ekta kurti lagbe size M', expectedFirst: 'kurti-cotton' },
  { language: 'mixed', text: 'ei কুর্তি টা ache?', expectedFirst: 'kurti-cotton' },
  { language: 'banglish', text: 'jamdani sari', expectedFirst: 'saree-jamdani' },
  { language: 'banglish', text: 'shari dekhan', expectedFirst: 'saree-jamdani' },
  { language: 'bangla', text: 'জামদানি শাড়ির দাম', expectedFirst: 'saree-jamdani' },
  { language: 'bangla', text: 'শাড়ী', expectedFirst: 'saree-jamdani' },
  { language: 'banglish', text: 'red panjabi koto taka', expectedFirst: 'panjabi-red' },
  { language: 'bangla', text: 'লাল পাঞ্জাবির দাম কত?', expectedFirst: 'panjabi-red' },
  { language: 'mixed', text: 'lal পাঞ্জাবি ache?', expectedFirst: 'panjabi-red' },
  { language: 'banglish', text: 'sada panjabi', expectedFirst: 'panjabi-white' },
  { language: 'bangla', text: 'সাদা পাঞ্জাবি', expectedFirst: 'panjabi-white' },
  { language: 'english', text: 'white punjabi', expectedFirst: 'panjabi-white' },
  { language: 'english', text: 'formal shirt', expectedFirst: 'shirt-formal' },
  { language: 'bangla', text: 'শার্ট আছে', expectedFirst: 'shirt-formal' },
  { language: 'banglish', text: 'shart', expectedFirst: 'shirt-formal' },
  { language: 'english', text: 'jeans', expectedFirst: 'jeans-slim' },
  { language: 'bangla', text: 'প্যান্ট', expectedFirst: 'jeans-slim' },
  { language: 'banglish', text: 'leather bag ache', expectedFirst: 'bag-leather' },
  { language: 'bangla', text: 'ব্যাগ', expectedFirst: 'bag-leather' },
  { language: 'banglish', text: 'byag koto', expectedFirst: 'bag-leather' },
  { language: 'banglish', text: 'juta ache', expectedFirst: 'shoes-sneaker' },
  { language: 'bangla', text: 'জুতা ৪১ সাইজ', expectedFirst: 'shoes-sneaker' },
  { language: 'english', text: 'sneakers size 42', expectedFirst: 'shoes-sneaker' },
  { language: 'banglish', text: 'hijab', expectedFirst: 'hijab-chiffon' },
  { language: 'bangla', text: 'হিজাব কালো', expectedFirst: 'hijab-chiffon' },
  { language: 'banglish', text: 'burka dekhan', expectedFirst: 'borka-abaya' },
  { language: 'bangla', text: 'বোরকা', expectedFirst: 'borka-abaya' },
  { language: 'banglish', text: 'ghori ache', expectedFirst: 'watch-men' },
  { language: 'bangla', text: 'ঘড়ি', expectedFirst: 'watch-men' },
  { language: 'english', text: 'wrist watch', expectedFirst: 'watch-men' },
  { language: 'bangla', text: 'ওড়না', expectedFirst: 'orna-silk' },
  { language: 'banglish', text: 'orna', expectedFirst: 'orna-silk' },
  { language: 'banglish', text: '1500 taka er moddhe kurti', expectedFirst: 'kurti-cotton' },
  { language: 'bangla', text: '১৩০০ টাকার নিচে পাঞ্জাবি', expectedFirst: 'panjabi-red' },
  { language: 'english', text: 'panjabi under 1400', expectedFirst: 'panjabi-red' },
  { language: 'english', text: 'panjabi under 800', expectedFirst: null },
  { language: 'english', text: 'laptop', expectedFirst: null },
  { language: 'bangla', text: 'মোবাইল ফোন', expectedFirst: null },
  { language: 'banglish', text: 'ফ্রিজ ache?', expectedFirst: null },
];
