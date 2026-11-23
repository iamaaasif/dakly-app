import type { EvalOutcome, GoldenCase } from './golden-case';

// The customer says yes to the order summary and the owner's Suggest add-ons switch decides what
// comes next. Uses the eval shop of golden-set.bangla.ts. An add-on is a same-category product in
// stock that costs at most twice the order; `neverOffer` holds every product the shop would not
// pick, so offering one of them, or any when the switch is off, fails the case.
const everyOtherThanKurti = [
  'পোলো শার্ট',
  'polo',
  'পাঞ্জাবি',
  'panjabi',
  'ক্যানভাস',
  'স্নিকার্স',
  'sneakers',
  'লোফার',
  'loafer',
  'হ্যান্ডব্যাগ',
  'handbag',
  'ডেনিম',
  'denim',
];
// The handbag is the only item in its category, so nothing else in the shop fits it.
const everyOtherThanHandbag = [
  ...everyOtherThanKurti,
  'কুর্তি',
  'kurti',
  'শাড়ি',
  'saree',
  'থ্রি পিস',
  'three piece',
];

const kurtiSummary = [
  { from: 'customer', text: 'কুর্তি M সাইজ ১টা নিব' },
  { from: 'shop', text: 'অর্ডার #1001 সামারি: কুর্তি M x1, মোট ৳1,510। হ্যাঁ লিখলে কনফার্ম হবে।' },
] as const;

export const addOnGoldenCases: GoldenCase[] = [
  {
    id: 'addon-kurti-on-bn',
    language: 'bangla',
    question: 'হ্যাঁ, কনফার্ম করুন',
    expectedHandover: null,
    allowedAmountsTaka: [2200, 2800],
    mentionsAnyOf: ['থ্রি পিস', 'শাড়ি'],
    neverOffer: everyOtherThanKurti,
    ownerSettings: { suggestAddOns: true },
    draftedOrder: ['কুর্তি'],
    earlier: [...kurtiSummary],
  },
  {
    id: 'addon-kurti-on-banglish',
    language: 'banglish',
    question: 'ji ok, confirm korun',
    expectedHandover: null,
    allowedAmountsTaka: [2200, 2800],
    mentionsAnyOf: ['থ্রি পিস', 'three piece', 'শাড়ি', 'saree'],
    neverOffer: everyOtherThanKurti,
    ownerSettings: { suggestAddOns: true },
    draftedOrder: ['কুর্তি'],
    earlier: [
      { from: 'customer', text: 'kurti M size 1ta nibo' },
      { from: 'shop', text: 'অর্ডার #1001 সামারি: কুর্তি M x1, মোট ৳1,510। হ্যাঁ লিখলে কনফার্ম হবে।' },
    ],
  },
  {
    id: 'addon-polo-on-english',
    language: 'english',
    question: 'yes, confirm please',
    expectedHandover: null,
    allowedAmountsTaka: [1200],
    mentionsAnyOf: ['পাঞ্জাবি', 'panjabi'],
    neverOffer: [
      'স্নিকার্স',
      'sneakers',
      'লোফার',
      'loafer',
      'ডেনিম',
      'denim',
      'হ্যান্ডব্যাগ',
      'handbag',
      'কুর্তি',
      'kurti',
      'শাড়ি',
      'saree',
    ],
    ownerSettings: { suggestAddOns: true },
    draftedOrder: ['পোলো শার্ট'],
    earlier: [
      { from: 'customer', text: 'I want the polo shirt, size L, one piece' },
      {
        from: 'shop',
        text: 'Order #1001 summary: polo shirt L x1, total ৳710. Reply yes to confirm.',
      },
    ],
  },
  {
    id: 'addon-three-piece-on-mixed',
    language: 'banglish',
    question: 'ha ji, thik ache, কনফার্ম koren',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 2800],
    mentionsAnyOf: ['কুর্তি', 'kurti', 'শাড়ি', 'saree'],
    neverOffer: [
      'স্নিকার্স',
      'sneakers',
      'লোফার',
      'loafer',
      'ডেনিম',
      'denim',
      'হ্যান্ডব্যাগ',
      'handbag',
      'পাঞ্জাবি',
      'panjabi',
    ],
    ownerSettings: { suggestAddOns: true },
    draftedOrder: ['থ্রি পিস'],
    earlier: [
      { from: 'customer', text: 'thri pis M size ta nibo' },
      { from: 'shop', text: 'অর্ডার #1001 সামারি: থ্রি পিস M x1, মোট ৳2,260। হ্যাঁ লিখলে কনফার্ম হবে।' },
    ],
  },
  // Nothing in stock fits, so the AI confirms and offers nothing.
  {
    id: 'addon-handbag-none-bn',
    language: 'bangla',
    question: 'জি, ঠিক আছে',
    expectedHandover: null,
    allowedAmountsTaka: [],
    neverOffer: everyOtherThanHandbag,
    ownerSettings: { suggestAddOns: true },
    draftedOrder: ['হ্যান্ডব্যাগ'],
    earlier: [
      { from: 'customer', text: 'লাল হ্যান্ডব্যাগটা নিব' },
      {
        from: 'shop',
        text: 'অর্ডার #1001 সামারি: হ্যান্ডব্যাগ লাল x1, মোট ৳1,860। হ্যাঁ লিখলে কনফার্ম হবে।',
      },
    ],
  },
  // The switch is off, so no other product is named.
  {
    id: 'addon-kurti-off-banglish',
    language: 'banglish',
    question: 'ji, confirm korun',
    expectedHandover: null,
    allowedAmountsTaka: [],
    neverOffer: ['থ্রি পিস', 'three piece', 'শাড়ি', 'saree', ...everyOtherThanKurti],
    draftedOrder: ['কুর্তি'],
    earlier: [
      { from: 'customer', text: 'kurti M size 1ta nibo' },
      { from: 'shop', text: 'অর্ডার #1001 সামারি: কুর্তি M x1, মোট ৳1,510। হ্যাঁ লিখলে কনফার্ম হবে।' },
    ],
  },
  {
    id: 'addon-kurti-off-bn',
    language: 'bangla',
    question: 'হ্যাঁ, কনফার্ম করুন',
    expectedHandover: null,
    allowedAmountsTaka: [],
    neverOffer: ['থ্রি পিস', 'three piece', 'শাড়ি', 'saree', ...everyOtherThanKurti],
    draftedOrder: ['কুর্তি'],
    earlier: [...kurtiSummary],
  },
];

export const addOnRecordedOutcomes: Record<string, EvalOutcome> = {
  'addon-kurti-on-bn': {
    kind: 'reply',
    text: 'আপনার অর্ডার কনফার্ম হয়েছে। আপনার জন্য থ্রি পিস ৳2,200 আর শাড়ি ৳2,800 আছে। কোনোটা যোগ করতে চান?',
  },
  'addon-kurti-on-banglish': {
    kind: 'reply',
    text: 'Order confirm hoyeche. Sathe থ্রি পিস ৳2,200 ba শাড়ি ৳2,800 nite chaile bolun, add kore dibo.',
  },
  'addon-polo-on-english': {
    kind: 'reply',
    text: 'Your order is confirmed. Would you like to add the লাল পাঞ্জাবি (red panjabi) for ৳1,200?',
  },
  'addon-three-piece-on-mixed': {
    kind: 'reply',
    text: 'আপনার অর্ডার কনফার্ম হয়েছে। সাথে কুর্তি ৳1,450 বা শাড়ি ৳2,800 নিতে চাইলে বলুন।',
  },
  'addon-handbag-none-bn': {
    kind: 'reply',
    text: 'আপনার অর্ডার কনফার্ম হয়েছে। ধন্যবাদ!',
  },
  'addon-kurti-off-banglish': {
    kind: 'reply',
    text: 'Apnar order confirm hoyeche. Dhonnobad!',
  },
  'addon-kurti-off-bn': {
    kind: 'reply',
    text: 'আপনার অর্ডার কনফার্ম হয়েছে। ধন্যবাদ!',
  },
};
