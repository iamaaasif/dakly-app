import type { EvalOutcome, GoldenCase } from './golden-case';

// Chats that start from an ad. The ad's products are read from the link the owner saved, so the
// customer's "দাম কত?" needs no product name, and a pick such as "নীলটা" can only mean one of them.
// Catalog: the eval shop of golden-set.bangla.ts. Four ads are linked:
//   fashion ad: কুর্তি and লাল পাঞ্জাবি
//   polo ad: পোলো শার্ট
//   shoe ad: ক্যানভাস জুতা (in stock) and স্নিকার্স (no stock)
//   big ad: কুর্তি, লাল পাঞ্জাবি, পোলো শার্ট and ক্যানভাস জুতা
//   an ad with no linked product (adProducts: [])
const fashionAd: Pick<GoldenCase, 'adProducts'> = { adProducts: ['কুর্তি', 'লাল পাঞ্জাবি'] };
const poloAd: Pick<GoldenCase, 'adProducts'> = { adProducts: ['পোলো শার্ট'] };
const shoeAd: Pick<GoldenCase, 'adProducts'> = { adProducts: ['ক্যানভাস জুতা', 'স্নিকার্স'] };
const bigAd: Pick<GoldenCase, 'adProducts'> = {
  adProducts: ['কুর্তি', 'লাল পাঞ্জাবি', 'পোলো শার্ট', 'ক্যানভাস জুতা'],
};
const unlinkedAd: Pick<GoldenCase, 'adProducts'> = { adProducts: [] };
const askWhich = ['কোন', 'কোনটা', 'kon', 'which'];

export const adContextGoldenCases: GoldenCase[] = [
  // One product: the price is that product's.
  {
    id: 'ad-price-single-bn',
    language: 'bangla',
    question: 'দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['পোলো', 'polo'],
    ...poloAd,
  },
  {
    id: 'ad-price-single-banglish',
    language: 'banglish',
    question: 'price koto?',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['পোলো', 'polo'],
    ...poloAd,
  },
  {
    id: 'ad-price-single-mixed',
    language: 'mixed',
    question: 'এই ad টার price কত?',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['পোলো', 'polo'],
    ...poloAd,
  },
  // Several products: each one's name and price, never one price for all.
  {
    id: 'ad-price-several-bn',
    language: 'bangla',
    question: 'দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 1200],
    mentionsAnyOf: ['কুর্তি'],
    ...fashionAd,
  },
  {
    id: 'ad-price-several-banglish',
    language: 'banglish',
    question: 'dam koto?',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 1200],
    mentionsAnyOf: ['পাঞ্জাবি', 'panjabi'],
    ...fashionAd,
  },
  {
    id: 'ad-price-four-mixed',
    language: 'mixed',
    question: 'সবগুলার price কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 1200, 650, 1500],
    mentionsAnyOf: ['জুতা', 'canvas', 'ক্যানভাস'],
    ...bigAd,
  },
  // A pick searches only the ad's products, and answers at that product's own price.
  {
    id: 'ad-pick-bn',
    language: 'bangla',
    question: 'পাঞ্জাবিটা কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1200],
    mentionsAnyOf: ['পাঞ্জাবি'],
    ...fashionAd,
  },
  {
    id: 'ad-pick-banglish',
    language: 'banglish',
    question: 'kurti ta nibo, dam koto?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti'],
    ...fashionAd,
  },
  {
    id: 'ad-pick-mixed',
    language: 'mixed',
    question: 'canvas জুতা টার price?',
    expectedHandover: null,
    allowedAmountsTaka: [1500],
    mentionsAnyOf: ['ক্যানভাস', 'canvas'],
    neverOffer: ['পাঞ্জাবি', 'শাড়ি'],
    ...bigAd,
  },
  // No product of the ad fits: ask which one, and never answer from the rest of the shop.
  {
    id: 'ad-pick-no-match-bn',
    language: 'bangla',
    question: 'নীলটা কত?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: askWhich,
    neverOffer: ['শাড়ি', 'পোলো', 'থ্রি পিস'],
    ...fashionAd,
  },
  {
    id: 'ad-pick-no-match-banglish',
    language: 'banglish',
    question: 'saree ta koto?',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 1200],
    mentionsAnyOf: askWhich,
    neverOffer: ['শাড়ি', 'saree'],
    ...fashionAd,
  },
  {
    id: 'ad-pick-no-match-mixed',
    language: 'mixed',
    question: 'নীল টা ache? price কত?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: askWhich,
    neverOffer: ['শাড়ি', 'পোলো'],
    ...fashionAd,
  },
  // An ad the shop has not linked: no guess, ask which product.
  {
    id: 'ad-unlinked-bn',
    language: 'bangla',
    question: 'দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: askWhich,
    neverOffer: ['কুর্তি', 'শাড়ি', 'পোলো', 'পাঞ্জাবি'],
    ...unlinkedAd,
  },
  {
    id: 'ad-unlinked-banglish',
    language: 'banglish',
    question: 'price koto?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: askWhich,
    neverOffer: ['কুর্তি', 'kurti', 'শাড়ি', 'polo', 'পোলো'],
    ...unlinkedAd,
  },
  // A product with no stock is named as out of stock and never offered; its price is still its own.
  {
    id: 'ad-sold-out-price-bn',
    language: 'bangla',
    question: 'দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1500, 1800],
    mentionsAnyOf: ['ক্যানভাস'],
    neverOffer: ['লোফার', 'loafer'],
    ...shoeAd,
  },
  {
    id: 'ad-sold-out-pick-banglish',
    language: 'banglish',
    question: 'sneakers ta ache?',
    expectedHandover: null,
    allowedAmountsTaka: [1800, 1500],
    mentionsAnyOf: ['নেই', 'nai', 'stock', 'স্টক'],
    neverOffer: ['লোফার', 'loafer'],
    ...shoeAd,
  },
  // A price ask is still not a discount: the price stays as the shop set it.
  {
    id: 'ad-discount-mixed',
    language: 'mixed',
    question: 'দাম কত? ad এ তো কম লেখা ছিল, discount দিবেন?',
    expectedHandover: null,
    acceptedHandover: 'discount',
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['পোলো', 'polo', 'নির্দিষ্ট', 'fixed'],
    ...poloAd,
  },
];

export const adContextRecordedOutcomes: Record<string, EvalOutcome> = {
  'ad-price-single-bn': { kind: 'reply', text: 'পোলো শার্টের দাম ৳৬৫০। কোন সাইজ লাগবে?' },
  'ad-price-single-banglish': { kind: 'reply', text: 'Polo shirt er dam ৳650. Kon size lagbe?' },
  'ad-price-single-mixed': { kind: 'reply', text: 'এই ad এর পোলো শার্ট ৳650, size বলবেন?' },
  'ad-price-several-bn': {
    kind: 'reply',
    text: 'কুর্তি ৳১,৪৫০\nলাল পাঞ্জাবি ৳১,২০০\nকোনটা নিতে চান?',
  },
  'ad-price-several-banglish': {
    kind: 'reply',
    text: 'Kurti ৳1,450\nLal panjabi ৳1,200\nKonta nite chan?',
  },
  'ad-price-four-mixed': {
    kind: 'reply',
    text: 'কুর্তি ৳১,৪৫০, লাল পাঞ্জাবি ৳১,২০০, পোলো শার্ট ৳৬৫০, ক্যানভাস জুতা ৳১,৫০০। কোনটা লাগবে?',
  },
  'ad-pick-bn': { kind: 'reply', text: 'লাল পাঞ্জাবির দাম ৳১,২০০। কোন সাইজ লাগবে?' },
  'ad-pick-banglish': { kind: 'reply', text: 'Kurti ৳1,450. Size bolben?' },
  'ad-pick-mixed': { kind: 'reply', text: 'ক্যানভাস জুতার price ৳1,500।' },
  'ad-pick-no-match-bn': {
    kind: 'reply',
    text: 'নীল রঙের কোনটা বলছেন? এই ad এ কুর্তি আর লাল পাঞ্জাবি আছে।',
  },
  'ad-pick-no-match-banglish': {
    kind: 'reply',
    text: 'Kon product er kotha bolchen? Ei ad e kurti ar lal panjabi ache.',
  },
  'ad-pick-no-match-mixed': {
    kind: 'reply',
    text: 'নীল কোন product টা বলছেন? Ad e kurti ar lal panjabi ache.',
  },
  'ad-unlinked-bn': { kind: 'reply', text: 'কোন প্রোডাক্টের দাম জানতে চান? নামটা বললে জানাবো।' },
  'ad-unlinked-banglish': {
    kind: 'reply',
    text: 'Kon product er price jante chan? Nam bolle janabo.',
  },
  'ad-sold-out-price-bn': {
    kind: 'reply',
    text: 'ক্যানভাস জুতার দাম ৳১,৫০০। স্নিকার্স এখন স্টকে নেই।',
  },
  'ad-sold-out-pick-banglish': {
    kind: 'reply',
    text: 'Sneakers ta ekhon stock e nai. Canvas juta ache, ৳1,500.',
  },
  'ad-discount-mixed': {
    kind: 'reply',
    text: 'পোলো শার্টের দাম ৳650, price fixed। Size bolben?',
  },
};
