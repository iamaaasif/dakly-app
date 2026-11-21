import { describe, expect, it } from 'vitest';

import { customerConfirms } from './order-confirmation';

describe('customerConfirms', () => {
  it.each(['yes', 'Ok', 'হ্যাঁ', 'ji', 'thik ache', 'ঠিক আছে', 'ওকে, পাঠান', 'Yes please confirm'])(
    'accepts %s',
    (text) => expect(customerConfirms([text])).toBe(true),
  );

  it.each([
    'আমি দুইটা নিব',
    'kurti ache?',
    'confirm korben na',
    'না, থাক',
    'no, cancel it',
    'yes but no',
    '',
  ])('refuses %s', (text) => expect(customerConfirms([text])).toBe(false));
});
