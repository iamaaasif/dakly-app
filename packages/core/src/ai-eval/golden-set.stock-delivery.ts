import type { EvalOutcome, GoldenCase } from './golden-case';

// Uses the eval shop of golden-set.bangla.ts. Only Dhaka is a delivery zone there; the outside-Dhaka
// charge is in the policy file.
export const stockDeliveryGoldenCases: GoldenCase[] = [
  // A size or colour with no product named: ask which product, never quote stock from a guess.
  {
    id: 'stock-no-product-banglish',
    language: 'banglish',
    question: 'L size ta restock hobe kobe?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['কোন', 'kon', 'which'],
    neverOffer: ['পোলো', 'polo'],
  },
  {
    id: 'stock-no-product-bn',
    language: 'bangla',
    question: 'L সাইজ আছে?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['কোন', 'কোনটা'],
    neverOffer: ['পোলো', 'polo'],
  },
  {
    id: 'stock-no-product-english',
    language: 'english',
    question: 'Is size L in stock?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['which', 'what product'],
    neverOffer: ['পোলো', 'polo'],
  },
  {
    id: 'stock-no-product-mixed',
    language: 'banglish',
    question: 'L size কবে আসবে? stock e nai?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['কোন', 'kon', 'which'],
    neverOffer: ['পোলো', 'polo'],
  },
  // The outside-Dhaka charge is in the shop's policy file, not in a delivery zone.
  {
    id: 'delivery-outside-dhaka-bn',
    language: 'bangla',
    question: 'চট্টগ্রামে ডেলিভারি চার্জ কত? কয়দিন লাগবে?',
    expectedHandover: null,
    allowedAmountsTaka: [120],
  },
  {
    id: 'delivery-outside-dhaka-banglish',
    language: 'banglish',
    question: 'Sylhet e delivery charge koto? koto din lagbe?',
    expectedHandover: null,
    allowedAmountsTaka: [120],
  },
  {
    id: 'delivery-outside-dhaka-mixed',
    language: 'banglish',
    question: 'ঢাকার বাইরে courier charge কত?',
    expectedHandover: null,
    allowedAmountsTaka: [120],
  },
  {
    id: 'delivery-outside-dhaka-english',
    language: 'english',
    question: 'What is the delivery charge to Rajshahi?',
    expectedHandover: null,
    allowedAmountsTaka: [120],
  },
  // A photo with a sure or sold-out match is answered as that product, without searching again.
  {
    id: 'photo-match-sure-bn',
    language: 'bangla',
    question: 'ছবি: লাল রঙের কুর্তি, সাদা ফুলের নকশা। দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি'],
    cardPhoto: 'kurti-red',
  },
  {
    id: 'photo-match-sure-banglish',
    language: 'banglish',
    question: 'photo: nil handbag, lomba strap. stock ache?',
    expectedHandover: null,
    allowedAmountsTaka: [1800],
    mentionsAnyOf: ['হ্যান্ডব্যাগ', 'ব্যাগ', 'handbag', 'bag'],
    cardPhoto: 'bag-blue',
  },
  {
    id: 'photo-match-sold-out-bn',
    language: 'bangla',
    question: 'ছবি: বাদামী চামড়ার লোফার জুতা। কত দাম?',
    expectedHandover: null,
    allowedAmountsTaka: [2100, 1500],
    mentionsAnyOf: ['নেই', 'স্টক'],
    neverOffer: ['স্নিকার্স', 'sneakers'],
  },
  {
    id: 'photo-match-sold-out-mixed',
    language: 'banglish',
    question: 'photo: white sports sneakers, lace-up. size ৪১ ache?',
    expectedHandover: null,
    allowedAmountsTaka: [1500, 1800],
    mentionsAnyOf: ['নেই', 'nai', 'স্টক', 'stock'],
    neverOffer: ['লোফার', 'loafer'],
  },
];

export const stockDeliveryRecordedOutcomes: Record<string, EvalOutcome> = {
  'photo-match-sure-bn': { kind: 'reply', text: 'কুর্তির দাম ৳১,৪৫০।', cardPhoto: 'kurti-red' },
  'photo-match-sure-banglish': {
    kind: 'reply',
    text: 'Nil handbag ache, 1800 tk.',
    cardPhoto: 'bag-blue',
  },
  'photo-match-sold-out-bn': { kind: 'reply', text: 'এই লোফারটা এখন স্টকে নেই।' },
  'photo-match-sold-out-mixed': { kind: 'reply', text: 'এই স্নিকার্স এখন স্টকে নেই।' },
  'stock-no-product-banglish': {
    kind: 'reply',
    text: 'কোন প্রোডাক্টের L সাইজের কথা বলছেন? নামটা বললে স্টক দেখে জানাবো।',
  },
  'stock-no-product-bn': {
    kind: 'reply',
    text: 'কোন প্রোডাক্টের L সাইজ জানতে চান? নাম বলুন, দেখে জানাচ্ছি।',
  },
  'stock-no-product-english': {
    kind: 'reply',
    text: 'Which product do you mean? Tell me the name and I will check size L.',
  },
  'stock-no-product-mixed': {
    kind: 'reply',
    text: 'কোন product er L size? নামটা বললে stock দেখে জানাবো।',
  },
  'delivery-outside-dhaka-bn': {
    kind: 'reply',
    text: 'ঢাকার বাইরে ডেলিভারি চার্জ ৳১২০, ৩-৫ দিন লাগে।',
  },
  'delivery-outside-dhaka-banglish': {
    kind: 'reply',
    text: 'Dhaka er baire delivery charge ৳120, 3-5 din lagbe.',
  },
  'delivery-outside-dhaka-mixed': {
    kind: 'reply',
    text: 'ঢাকার বাইরে courier charge ৳১২০, 3-5 দিন লাগবে।',
  },
  'delivery-outside-dhaka-english': {
    kind: 'reply',
    text: 'Delivery outside Dhaka is ৳120 and takes 3-5 days.',
  },
};
