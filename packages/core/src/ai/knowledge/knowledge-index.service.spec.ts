import { describe, expect, it } from 'vitest';

import { splitKnowledgeText } from './knowledge-index.service';

describe('splitKnowledgeText', () => {
  it('preserves Bangla words and drops blank passages', () => {
    expect(splitKnowledgeText('  ঢাকায় ডেলিভারি ৬০ টাকা।\n')).toEqual(['ঢাকায় ডেলিভারি ৬০ টাকা।']);
    expect(splitKnowledgeText(' \n  ')).toEqual([]);
  });

  it('keeps large inputs bounded without breaking an astral character', () => {
    const text = String.fromCodePoint(0x10437).repeat(3000);
    const passages = splitKnowledgeText(text);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.every((passage) => Buffer.byteLength(passage) <= 2000)).toBe(true);
    expect(passages.join('')).toBe(text);
  });
});
