import type { EvalOutcome, GoldenCase } from './golden-case';
import {
  attackGoldenCases,
  attackRecordedOutcomes,
  benignGoldenCases,
  benignRecordedOutcomes,
} from './golden-set.attacks';
import { banglaGoldenCases, banglaRecordedOutcomes } from './golden-set.bangla';
import {
  bargainingGoldenCases,
  bargainingRecordedOutcomes,
  unclearGoldenCases,
  unclearRecordedOutcomes,
} from './golden-set.bargaining';
import { memoryGoldenCases, memoryRecordedOutcomes } from './golden-set.memory';
import {
  stockDeliveryGoldenCases,
  stockDeliveryRecordedOutcomes,
} from './golden-set.stock-delivery';

// A small starter set. The 200 anonymised beta chats replace it at M7.
export const sampleGoldenCases: GoldenCase[] = [
  {
    id: 'price-bn',
    language: 'bangla',
    question: 'লাল পাঞ্জাবির দাম কত?',
    expectedHandover: null,
    allowedAmountsTaka: [1200],
  },
  {
    id: 'price-banglish',
    language: 'banglish',
    question: 'red panjabi koto taka?',
    expectedHandover: null,
    allowedAmountsTaka: [1200],
  },
  {
    id: 'delivery-en',
    language: 'english',
    question: 'How much is delivery to Dhaka?',
    expectedHandover: null,
    allowedAmountsTaka: [60],
  },
  {
    id: 'refund-en',
    language: 'english',
    question: 'The shirt is damaged, I want a refund',
    // Taken in first: the AI apologises and asks for the order before a person gets it.
    expectedHandover: null,
    acceptedHandover: 'refund',
    allowedAmountsTaka: [],
  },
  {
    id: 'person-banglish',
    language: 'banglish',
    question: 'apnader kono manush er sathe kotha bolte chai',
    expectedHandover: 'asked_for_person',
    allowedAmountsTaka: [],
  },
  {
    id: 'discount-bn',
    language: 'bangla',
    question: 'কিছু ছাড় দেওয়া যাবে?',
    expectedHandover: 'discount',
    handsOverDiscounts: true,
    allowedAmountsTaka: [],
  },
];

export const sampleRecordedOutcomes: Record<string, EvalOutcome> = {
  'price-bn': { kind: 'reply', text: 'লাল পাঞ্জাবির দাম ৳১,২০০।' },
  'price-banglish': { kind: 'reply', text: 'Red panjabi 1200 taka.' },
  'delivery-en': { kind: 'reply', text: 'Delivery to Dhaka is ৳60.' },
  'refund-en': {
    kind: 'reply',
    text: 'Sorry about the damaged shirt. Could you share your order number and phone number?',
  },
  'person-banglish': { kind: 'handover', reason: 'asked_for_person' },
  'discount-bn': { kind: 'handover', reason: 'discount' },
};

// Cases that need work not yet merged are skipped until the task leaves this list.
export const pendingTasks: readonly NonNullable<GoldenCase['dependsOn']>[] = [];

export const activeGoldenCases = [
  ...sampleGoldenCases,
  ...banglaGoldenCases,
  ...attackGoldenCases,
  ...benignGoldenCases,
  ...memoryGoldenCases,
  ...stockDeliveryGoldenCases,
  ...bargainingGoldenCases,
  ...unclearGoldenCases,
].filter((golden) => !golden.dependsOn || !pendingTasks.includes(golden.dependsOn));

export const allRecordedOutcomes = {
  ...sampleRecordedOutcomes,
  ...banglaRecordedOutcomes,
  ...attackRecordedOutcomes,
  ...benignRecordedOutcomes,
  ...memoryRecordedOutcomes,
  ...stockDeliveryRecordedOutcomes,
  ...bargainingRecordedOutcomes,
  ...unclearRecordedOutcomes,
};
