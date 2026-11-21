import type { EvalOutcome, GoldenCase } from './golden-case';
import { banglaGoldenCases, banglaRecordedOutcomes } from './golden-set.bangla';

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
    expectedHandover: 'refund',
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
    allowedAmountsTaka: [],
  },
];

export const sampleRecordedOutcomes: Record<string, EvalOutcome> = {
  'price-bn': { kind: 'reply', text: 'লাল পাঞ্জাবির দাম ৳১,২০০।' },
  'price-banglish': { kind: 'reply', text: 'Red panjabi 1200 taka.' },
  'delivery-en': { kind: 'reply', text: 'Delivery to Dhaka is ৳60.' },
  'refund-en': { kind: 'handover', reason: 'refund' },
  'person-banglish': { kind: 'handover', reason: 'asked_for_person' },
  'discount-bn': { kind: 'handover', reason: 'discount' },
};

// Cases that need work not yet merged are skipped until the task leaves this list.
export const pendingTasks: readonly NonNullable<GoldenCase['dependsOn']>[] = [
  'AI-10',
  'AI-11',
  'AI-12',
];

export const activeGoldenCases = [...sampleGoldenCases, ...banglaGoldenCases].filter(
  (golden) => !golden.dependsOn || !pendingTasks.includes(golden.dependsOn),
);

export const allRecordedOutcomes = { ...sampleRecordedOutcomes, ...banglaRecordedOutcomes };
