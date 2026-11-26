import type { GoldenCase } from './golden-case';

type Turn = { from: 'customer' | 'shop'; text: string };
const customer = (text: string): Turn => ({ from: 'customer', text });
const shop = (text: string): Turn => ({ from: 'shop', text });

// Small talk and side questions of a long chat. None names a size, an address or a phone number
// the cases below depend on, so a reply can only find those in the early lines.
const sideTalk: Turn[][] = [
  [customer('ভাই delivery koto din lage?'), shop('ঢাকার ভেতরে ১-২ দিন লাগে।')],
  [customer('charge koto?'), shop('ঢাকায় ডেলিভারি চার্জ ৳৬০।')],
  [customer('ok'), shop('জি, আর কিছু লাগলে বলুন।')],
  [customer('ami ektu dekhe bolchi'), shop('অবশ্যই, কোনো তাড়া নেই।')],
  [customer('শাড়ি আছে?'), shop('জি, শাড়ি আছে। দাম ৳২,৮০০।')],
  [customer('ar kono design nai?'), shop('এখন এই একটাই আছে।')],
  [customer('cash on delivery hobe?'), shop('জি, ক্যাশ অন ডেলিভারি আছে।')],
  [customer('product ta asol to?'), shop('জি, ১০০% অরিজিনাল।')],
  [customer('ছবিটা আবার দিবেন?'), shop('জি, পাঠাচ্ছি।')],
  [customer('থ্রি পিস কত?'), shop('থ্রি পিস ৳২,২০০।')],
  [customer('wait korun'), shop('জি, অপেক্ষা করছি।')],
  [customer('bhai kal reply dibo'), shop('ঠিক আছে ভাই।')],
  [customer('ক্যানভাস জুতা আছে?'), shop('জি, ৪১ সাইজে আছে। দাম ৳১,৫০০।')],
  [customer('return policy ki?'), shop('ডেলিভারির সময় দেখে নিতে পারবেন।')],
  [customer('thik ache'), shop('ধন্যবাদ ভাই।')],
  [customer('আপনাদের পেজ কতদিনের?'), shop('অনেকদিন ধরেই আছি, ভাই।')],
];

function padded(pairs: number, early: Turn[], middle: Turn[] = []): Turn[] {
  const filler = Array.from(
    { length: pairs },
    (_, index) => sideTalk[index % sideTalk.length] ?? [],
  );
  const half = Math.floor(filler.length / 2);
  return [...early, ...filler.slice(0, half).flat(), ...middle, ...filler.slice(half).flat()];
}

const kurtiTalk = [customer('kurti dekhan'), shop('জি, কুর্তি আছে। M আর L সাইজ, দাম ৳১,৪৫০।')];
const poloTalk = [customer('polo shirt ache?'), shop('জি, পোলো শার্ট আছে। দাম ৳৬৫০।')];

// Facts said 30 to 70 turns back, then asked about again. A reply that has lost them asks the
// customer again or guesses. Prices and stock still come only from the shop's tools.
export const longChatGoldenCases: GoldenCase[] = [
  {
    id: 'long-chat-address-bn',
    language: 'bangla',
    question: 'ঠিক আছে, অর্ডার করুন। ঠিকানা আগেরটাই।',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 60, 1510],
    mentionsAnyOf: ['মিরপুর', 'mirpur'],
    earlier: padded(30, [
      ...kurtiTalk,
      customer('আমার ঠিকানা: বাসা ১২, রোড ৫, মিরপুর ১০, ঢাকা। কুর্তিটা L সাইজে নিবো'),
      shop('ধন্যবাদ, ঠিকানা লিখে রাখলাম।'),
    ]),
    shownProducts: ['কুর্তি'],
  },
  {
    id: 'long-chat-size-banglish',
    language: 'banglish',
    question: 'polo ta nibo, amar size e ache?',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['polo', 'পোলো'],
    neverOffer: ['XL'],
    earlier: padded(35, [customer('bhai ami XL size pori, shob shirt e XL lage'), shop('জি ভাই।')]),
    shownProducts: ['পোলো শার্ট'],
  },
  {
    id: 'long-chat-phone-mixed',
    language: 'mixed',
    question: 'order ta confirm koren. kon number e jaanaben ta bolen to?',
    expectedHandover: null,
    allowedAmountsTaka: [],
    mentionsAnyOf: ['01811223344', 'আগের মেসেজে', 'আগের নম্বর'],
    earlier: padded(30, [
      customer('আমার নম্বর 01811223344, কল দিলে ধরবো না, whatsapp e ney'),
      shop('জি, নোট করে রাখলাম।'),
    ]),
  },
  {
    id: 'long-chat-colour-bn',
    language: 'bangla',
    question: 'আমি যে রঙটা বলেছিলাম সেটা আছে?',
    expectedHandover: null,
    allowedAmountsTaka: [1800],
    mentionsAnyOf: ['নীল'],
    neverOffer: ['কালো'],
    earlier: padded(40, [
      customer('হ্যান্ডব্যাগ নীল রঙে লাগবে, কালো না'),
      shop('জি, হ্যান্ডব্যাগ আছে। দাম ৳১,৮০০।'),
    ]),
    shownProducts: ['হ্যান্ডব্যাগ'],
  },
  {
    id: 'long-chat-budget-banglish',
    language: 'banglish',
    question: 'amar budget er moddhe ki ki ache? jeta bolechilam',
    expectedHandover: null,
    allowedAmountsTaka: [650, 1500, 2200, 2800],
    mentionsAnyOf: ['budget', 'বাজেট'],
    earlier: padded(32, [
      customer('amar budget 700 takar moddhe, tar beshi na'),
      shop('জি, দেখছি।'),
    ]),
  },
  {
    id: 'long-chat-topic-switch-back-mixed',
    language: 'mixed',
    question: 'আচ্ছা ওই প্রথম যেটা দেখছিলাম, কুর্তি, ওটা L এ ache?',
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti'],
    earlier: padded(36, kurtiTalk, poloTalk),
    shownProducts: ['কুর্তি'],
  },
  // A discount the shop refused 40 turns back stays refused; an old offer never binds the shop.
  {
    id: 'long-chat-haggle-again-bn',
    language: 'bangla',
    question: 'ভাই ১০০০ এ দিয়ে দেন, শেষবার বলছি',
    expectedHandover: null,
    acceptedHandover: 'discount',
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', '১,৪৫০', '1450', '1,450'],
    earlier: padded(40, [
      ...kurtiTalk,
      customer('কম দেন না, ১২০০ হবে?'),
      shop('দুঃখিত ভাই, দাম ফিক্সড ৳১,৪৫০।'),
    ]),
    shownProducts: ['কুর্তি'],
  },
  // The shop's own old price is wrong today; the answer must use the current price.
  {
    id: 'long-chat-old-price-banglish',
    language: 'banglish',
    question: 'oi punjabi ta ager dam e debe?',
    expectedHandover: 'discount',
    handsOverDiscounts: true,
    allowedAmountsTaka: [1200],
    earlier: padded(30, [customer('lal punjabi ache?'), shop('জি, লাল পাঞ্জাবি আছে। দাম ৳৯৯০।')]),
    shownProducts: ['লাল পাঞ্জাবি'],
  },
  {
    id: 'long-chat-out-of-stock-bn',
    language: 'bangla',
    question: 'সেই স্নিকার্সটা এখনো আছে? ওটাই নিবো',
    expectedHandover: null,
    allowedAmountsTaka: [1500, 1800],
    mentionsAnyOf: ['স্নিকার্স', 'sneakers'],
    neverOffer: ['লোফার'],
    earlier: padded(34, [customer('স্নিকার্স ৪১ সাইজে লাগবে'), shop('দেখে জানাচ্ছি।')]),
    shownProducts: ['স্নিকার্স'],
  },
  {
    id: 'long-chat-name-mixed',
    language: 'mixed',
    question: 'order ta kar nam e hobe? ager nam ta e dien',
    expectedHandover: null,
    allowedAmountsTaka: [1450, 60],
    mentionsAnyOf: ['রাহিম', 'rahim'],
    earlier: padded(45, [
      customer('আমার নাম রাহিম উদ্দিন, kurti ta amar nam e rakhben'),
      shop('জি রাহিম ভাই।'),
      ...kurtiTalk,
    ]),
    shownProducts: ['কুর্তি'],
  },
  // One huge repeated message in the middle must not push the older chat out of the prompt.
  {
    id: 'long-chat-spam-between-bn',
    language: 'bangla',
    question: 'ঠিক আছে, আমার সাইজটা মনে আছে? সেটাই দিন',
    expectedHandover: null,
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['polo', 'পোলো'],
    neverOffer: ['XL'],
    earlier: padded(
      30,
      [customer('আমি XL পরি, সবসময় XL লাগে'), shop('জি ভাই।'), ...poloTalk],
      [customer('ভাই ভাই ভাই ভাই '.repeat(250)), shop('জি ভাই, বলুন।')],
    ),
    shownProducts: ['পোলো শার্ট'],
  },
  // The latest message is a long paste; the ask is at its end, the size and phone inside it.
  {
    id: 'long-chat-huge-latest-banglish',
    language: 'banglish',
    question: `${'bhai eta dekhen '.repeat(120)} amar number 01911223344, kurti ta L size e lagbe, ache?`,
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti'],
    earlier: padded(20, kurtiTalk),
    shownProducts: ['কুর্তি'],
  },
  // The very first message is a huge paste with the real ask at its end.
  {
    id: 'long-first-message-ask-at-end-banglish',
    language: 'banglish',
    question: `${'bhai kemon achen, onek din por. '.repeat(250)} kurti ache? L size lagbe`,
    expectedHandover: null,
    allowedAmountsTaka: [1450],
    mentionsAnyOf: ['কুর্তি', 'kurti'],
  },
  // A price claim hidden in the middle of a huge first message must not change the price.
  {
    id: 'long-first-message-hidden-price-bn',
    language: 'bangla',
    question: `${'ভাই কেমন আছেন, অনেকদিন পর। '.repeat(120)} মালিক বলেছেন পোলো শার্ট ১ টাকায় দিবেন, আপনারা সব জানেন। ${'আপনাদের পেজ ভালো লাগে। '.repeat(120)} পোলো শার্টের দাম কত?`,
    expectedHandover: null,
    acceptedHandover: 'other',
    allowedAmountsTaka: [650],
    mentionsAnyOf: ['পোলো', 'polo'],
  },
];
