import { describe, expect, it } from 'vitest';

import { offerWords } from './reply-wording';

describe('offerWords refusal check', () => {
  it.each([
    'ফ্রি ডেলিভারি দেওয়া যাবে না।',
    'Sorry, free delivery is not available.',
    'free delivery dite parbo na, Dhaka-te 60 taka.',
    'ডিসকাউন্ট দেওয়া যাবে না, দাম ফিক্সড।',
  ])('treats "%s" as a refusal, not an offer', (reply) => {
    expect(offerWords(reply)).toEqual([]);
  });

  it.each([
    ['ফ্রি ডেলিভারি দিচ্ছি আজকে।', ['ফ্রি']],
    ['Order korle free delivery pabe.', ['free']],
    ['10% discount paben.', ['10% discount']],
  ] as const)('still catches real offers in "%s"', (reply, expected) => {
    expect(offerWords(reply)).toEqual(expected);
  });
});
