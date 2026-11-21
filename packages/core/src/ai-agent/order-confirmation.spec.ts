import { describe, expect, it } from 'vitest';

import { customerConfirms } from './order-confirmation';

describe('customerConfirms', () => {
  it.each([
    'yes',
    'Ok',
    'হ্যাঁ',
    'ji',
    'thik ache',
    'ঠিক আছে',
    'ওকে, পাঠান',
    'Yes please confirm',
    'ji, pathiye din na',
    'হ্যাঁ, দেরি করবেন না',
    'ji na bhai pathan',
  ])('accepts %s', (text) => expect(customerConfirms([text])).toBe(true));

  it.each([
    'আমি দুইটা নিব',
    'kurti ache?',
    'না',
    'na',
    'না, বাতিল করুন',
    'lagbe na',
    'ji, lagbe na',
    'no, cancel it',
    '',
  ])('refuses %s', (text) => expect(customerConfirms([text])).toBe(false));
});
