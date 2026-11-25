import type { EvalOutcome, GoldenCase } from './golden-case';

// A complaint is taken in first: the AI apologises and asks for the order, looks it up, tells what
// the tools show and only then hands over. It never promises a refund, compensation or a date.
const askedDetails: Pick<GoldenCase, 'earlier'> = {
  earlier: [
    { from: 'customer', text: 'apnara fraud! ager order ashe nai' },
    {
      from: 'shop',
      text: 'দুঃখিত, আপনার অসুবিধার জন্য আমরা সত্যিই লজ্জিত। অর্ডার নম্বর আর ফোন নম্বরটা দেবেন?',
    },
  ],
};
const detailWords = ['অর্ডার', 'order', 'নম্বর', 'number', 'ফোন', 'phone'];

export const complaintGoldenCases: GoldenCase[] = [
  {
    id: 'complaint-fraud-banglish',
    language: 'banglish',
    question: 'apnara fraud! ager order ashe nai',
    expectedHandover: null,
    acceptedHandover: 'angry',
    allowedAmountsTaka: [],
    mentionsAnyOf: detailWords,
  },
  {
    id: 'complaint-late-bn',
    language: 'bangla',
    question: 'আমার অর্ডার ৫ দিন হয়ে গেল, এখনো আসেনি',
    expectedHandover: null,
    acceptedHandover: 'complaint',
    allowedAmountsTaka: [],
    mentionsAnyOf: detailWords,
  },
  {
    id: 'complaint-wrong-mixed',
    language: 'mixed',
    question: 'আমি যেটা order করছিলাম সেটা না দিয়ে onno product pathaise, eta ki kore hoy?',
    expectedHandover: null,
    acceptedHandover: 'complaint',
    allowedAmountsTaka: [],
    mentionsAnyOf: detailWords,
  },
  {
    id: 'complaint-details-banglish',
    language: 'banglish',
    question: 'order number 1042, phone 01712345678',
    expectedHandover: 'complaint',
    acceptedHandover: 'angry',
    allowedAmountsTaka: [],
    ...askedDetails,
  },
  {
    id: 'complaint-details-bn',
    language: 'bangla',
    question: 'অর্ডার নম্বর ১০৪২, ফোন ০১৭১২৩৪৫৬৭৮',
    expectedHandover: 'complaint',
    acceptedHandover: 'angry',
    allowedAmountsTaka: [],
    ...askedDetails,
  },
  {
    id: 'complaint-no-repeat-name-banglish',
    language: 'banglish',
    question: 'order 1042 ekhono ashe nai, amar nam Karim, phone 01712345678',
    expectedHandover: 'complaint',
    acceptedHandover: 'angry',
    allowedAmountsTaka: [],
    earlier: [
      { from: 'customer', text: 'amar order kothay?' },
      { from: 'shop', text: 'দুঃখিত, আপনার অর্ডার নম্বর বা ফোন নম্বর ও নামটা দেবেন?' },
    ],
  },
  {
    id: 'complaint-refuses-details-bn',
    language: 'bangla',
    question: 'আমি কোনো নম্বর বা নাম দেব না, এখনি মানুষের সাথে কথা বলব',
    expectedHandover: 'asked_for_person',
    acceptedHandover: 'complaint',
    allowedAmountsTaka: [],
    earlier: [
      { from: 'customer', text: 'আমার ডেলিভারি আসেনি' },
      { from: 'shop', text: 'দুঃখিত, অর্ডার নম্বর আর ফোন নম্বরটা দেবেন?' },
    ],
  },
  {
    id: 'complaint-damaged-photo-mixed',
    language: 'mixed',
    question: 'কুর্তিটা torn এসেছে, ক্ষতি হয়েছে',
    expectedHandover: null,
    acceptedHandover: 'complaint',
    allowedAmountsTaka: [],
    mentionsAnyOf: detailWords,
  },
];

export const complaintRecordedOutcomes: Record<string, EvalOutcome> = {
  'complaint-fraud-banglish': {
    kind: 'reply',
    text: 'দুঃখিত, আপনার অসুবিধার জন্য আমরা লজ্জিত। অর্ডার নম্বর বা ফোন নম্বরটা বলবেন, আমি দেখছি।',
  },
  'complaint-late-bn': {
    kind: 'reply',
    text: 'দুঃখিত, দেরি হওয়ায় অসুবিধা হয়েছে। অর্ডার নম্বর আর ফোন নম্বরটা দিলে আমি দেখে বলছি।',
  },
  'complaint-wrong-mixed': {
    kind: 'reply',
    text: 'দুঃখিত, ভুল পণ্য পাওয়ায় সমস্যা হয়েছে। আপনার order number আর ফোন নম্বর দেবেন?',
  },
  'complaint-details-banglish': { kind: 'handover', reason: 'complaint' },
  'complaint-details-bn': { kind: 'handover', reason: 'complaint' },
  'complaint-no-repeat-name-banglish': { kind: 'handover', reason: 'complaint' },
  'complaint-refuses-details-bn': { kind: 'handover', reason: 'asked_for_person' },
  'complaint-damaged-photo-mixed': {
    kind: 'reply',
    text: 'দুঃখিত, ছেঁড়া পণ্য পাওয়ায় আমরা লজ্জিত। অর্ডার নম্বর বা ফোন নম্বর আর একটা ছবি দেবেন?',
  },
};
