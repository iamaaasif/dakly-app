import { describe, expect, it } from 'vitest';

import { isWithinOneEdit, searchWords, wordKey } from './search-text';

describe('wordKey', () => {
  it.each([
    ['kurti', 'কুর্তি'],
    ['kurtii', 'কুর্তি'],
    ['sari', 'শাড়ি'],
    ['shari', 'শাড়ী'],
    ['panjabi', 'পাঞ্জাবি'],
    ['punjabi', 'পাঞ্জাবী'],
    ['bag', 'ব্যাগ'],
    ['byag', 'ব্যাগ'],
    ['juta', 'জুতা'],
    ['hijab', 'হিজাব'],
  ])('gives %s and %s the same key', (latin, bangla) => {
    expect(wordKey(latin)).toBe(wordKey(bangla));
  });

  it('keeps different products apart', () => {
    expect(wordKey('shirt')).not.toBe(wordKey('sari'));
    expect(wordKey('panjabi')).not.toBe(wordKey('pant'));
  });

  it('keeps numbers as they are', () => {
    expect(wordKey('42')).toBe('42');
  });
});

describe('searchWords', () => {
  it('turns Bangla digits into ASCII and drops punctuation', () => {
    expect(searchWords('জুতা ৪১ সাইজ?')).toEqual(['জুতা', '41', 'সাইজ']);
  });

  it('treats a precomposed and a decomposed য় the same', () => {
    expect(searchWords('য়')).toEqual(searchWords('য়'));
  });

  it('removes Latin accents and case', () => {
    expect(searchWords('Kurtí, SARI')).toEqual(['kurti', 'sari']);
  });
});

describe('isWithinOneEdit', () => {
  it.each([
    ['kurti', 'kurti', true],
    ['kurti', 'kurt', true],
    ['kurti', 'kurtu', true],
    ['kurti', 'krti', true],
    ['kurti', 'kurtiss', false],
    ['kurti', 'sari', false],
  ])('%s vs %s', (left, right, expected) => {
    expect(isWithinOneEdit(left!, right!)).toBe(expected);
  });
});
