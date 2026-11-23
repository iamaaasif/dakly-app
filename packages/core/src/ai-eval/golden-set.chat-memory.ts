import type { EvalOutcome, GoldenCase } from './golden-case';

// Follow-ups that name no product. The product comes from what the shop already showed in the
// chat, read again for its price and stock, never from an old message or a guess.
const kurtiShown: Pick<GoldenCase, 'earlier' | 'shownProducts'> = {
  earlier: [
    { from: 'customer', text: 'kurti ache?' },
    { from: 'shop', text: 'জি, কুর্তি আছে। M আর L সাইজ, দাম ৳১,৪৫০।' },
  ],
  shownProducts: ['কুর্তি'],
};
const kurtiPhoto: Pick<GoldenCase, 'earlier' | 'shownProducts'> = {
  earlier: [
    {
      from: 'customer',
      text: 'Photo: A red kurti with a white flower print.\nSearch words: red kurti flower',
    },
    { from: 'shop', text: 'এটা আমাদের কুর্তি, দাম ৳১,৪৫০।' },
  ],
  shownProducts: ['কুর্তি'],
};
const poloShown: Pick<GoldenCase, 'earlier' | 'shownProducts'> = {
  earlier: [
    { from: 'customer', text: 'polo shirt dekhan' },
    { from: 'shop', text: 'পোলো শার্ট, দাম ৳৬৫০।' },
  ],
  shownProducts: ['পোলো শার্ট'],
};
const deliveryOnly: Pick<GoldenCase, 'earlier'> = {
  earlier: [
    { from: 'customer', text: 'Dhaka te delivery charge koto?' },
    { from: 'shop', text: 'ঢাকায় ডেলিভারি চার্জ ৳৬০।' },
  ],
};

export const chatMemoryGoldenCases: GoldenCase[] = [
  {
    id: 'chat-memory-size-banglish',
    language: 'banglish',
    question: 'L size ache?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti', 'আছে', 'ache'],
    ...kurtiShown,
  },
  {
    id: 'chat-memory-size-bn',
    language: 'bangla',
    question: 'L সাইজ আছে?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'আছে'],
    ...kurtiShown,
  },
  {
    id: 'chat-memory-size-mixed',
    language: 'banglish',
    question: 'এটার L size কয়টা আছে?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['৮', '8'],
    ...kurtiShown,
  },
  {
    id: 'chat-memory-photo-banglish',
    language: 'banglish',
    question: 'red ta ache?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti'],
    ...kurtiPhoto,
  },
  {
    id: 'chat-memory-photo-bn',
    language: 'bangla',
    question: 'লালটা আছে? দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', '১,৪৫০', '১৪৫০', '1450', '1,450'],
    ...kurtiPhoto,
  },
  {
    id: 'chat-memory-photo-mixed',
    language: 'banglish',
    question: 'red টা M size এ পাওয়া যাবে?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti', 'M'],
    ...kurtiPhoto,
  },
  // XL has no stock: the follow-up gets the in-stock size and never XL as an offer.
  {
    id: 'chat-memory-stock-banglish',
    language: 'banglish',
    question: 'amar size M, ache?',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['M'],
    neverOffer: ['XL'],
    ...poloShown,
  },
  {
    id: 'chat-memory-stock-bn',
    language: 'bangla',
    question: 'M সাইজটা আছে?',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['M'],
    neverOffer: ['XL'],
    ...poloShown,
  },
  // Naming another product moves on from the shown one, at that product's own price.
  {
    id: 'chat-memory-other-product-mixed',
    language: 'banglish',
    question: 'আর panjabi L size আছে? দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1200],
    mentionsAnyOf: ['পাঞ্জাবি', 'panjabi'],
    ...kurtiShown,
  },
  // Nothing shown yet: still ask which product.
  {
    id: 'chat-memory-no-product-banglish',
    language: 'banglish',
    question: 'L size ache?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['কোন', 'kon', 'which'],
    neverOffer: ['পোলো', 'polo', 'কুর্তি', 'kurti'],
    ...deliveryOnly,
  },
  {
    id: 'chat-memory-no-product-bn',
    language: 'bangla',
    question: 'L সাইজ আছে?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['কোন', 'কোনটা'],
    neverOffer: ['পোলো', 'polo', 'কুর্তি', 'kurti'],
    ...deliveryOnly,
  },
];

export const chatMemoryRecordedOutcomes: Record<string, EvalOutcome> = {
  'chat-memory-size-banglish': { kind: 'reply', text: 'জি, কুর্তি L size e ache, ৳1,450।' },
  'chat-memory-size-bn': { kind: 'reply', text: 'জি, কুর্তির L সাইজ আছে, দাম ৳১,৪৫০।' },
  'chat-memory-size-mixed': { kind: 'reply', text: 'কুর্তির L size এ ৮টা আছে, দাম ৳১,৪৫০।' },
  'chat-memory-photo-banglish': { kind: 'reply', text: 'Ji, red kurti ache, ৳1,450।' },
  'chat-memory-photo-bn': { kind: 'reply', text: 'জি, লাল কুর্তি আছে, দাম ৳১,৪৫০।' },
  'chat-memory-photo-mixed': { kind: 'reply', text: 'জি, red কুর্তি M size এ আছে, ৳১,৪৫০।' },
  'chat-memory-stock-banglish': { kind: 'reply', text: 'Ji, polo shirt M size e ache, ৳650।' },
  'chat-memory-stock-bn': { kind: 'reply', text: 'জি, পোলো শার্টের M সাইজ আছে, ৳৬৫০।' },
  'chat-memory-other-product-mixed': {
    kind: 'reply',
    text: 'জি, লাল পাঞ্জাবি L size আছে, দাম ৳১,২০০।',
  },
  'chat-memory-no-product-banglish': {
    kind: 'reply',
    text: 'কোন প্রোডাক্টের L size এর কথা বলছেন? নামটা বললে দেখে জানাবো।',
  },
  'chat-memory-no-product-bn': {
    kind: 'reply',
    text: 'কোন প্রোডাক্টের L সাইজ চাচ্ছেন? নামটা বলবেন?',
  },
};
