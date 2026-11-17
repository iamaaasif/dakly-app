import { describe, expect, it } from 'vitest';

import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('takes the first letter of the first two words in upper case', () => {
    expect(initialsOf('jakir hossain khan')).toBe('JH');
    expect(initialsOf('Urban')).toBe('U');
  });
  it('keeps a Bangla letter together with its vowel sign', () => {
    expect(initialsOf('সাবিনা আক্তার')).toBe('সাআ');
  });
});
