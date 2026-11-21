import { describe, expect, it } from 'vitest';

import type { ContactMemoryFact } from '@dakly/contracts/contact-memory';

import {
  isStorableFactValue,
  mergeContactMemory,
  renderContactMemory,
  utf8Bytes,
} from './contact-memory-rules';

const id = '018f0000-0000-7000-8000-000000000001';

function fact(value: string, overrides: Partial<ContactMemoryFact> = {}): ContactMemoryFact {
  return {
    kind: 'style',
    value,
    source: 'customer_message',
    sourceId: id,
    at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

const minute = (index: number) => new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString();
const wordCount = (text: string) => text.split(/\s+/).length;

describe('isStorableFactValue', () => {
  it.each(['M', 'লাল রং', 'budget 1500 takar moddhe', 'Mirpur'])('keeps %s', (value) => {
    expect(isStorableFactValue(value)).toBe(true);
  });

  it.each(['01712345678', '০১৭১২৩৪৫৬৭৮', '4111 1111 1111 1111', 'bKash number', 'my OTP is 5'])(
    'drops %s',
    (value) => {
      expect(isStorableFactValue(value)).toBe(false);
    },
  );
});

describe('mergeContactMemory', () => {
  it('does not repeat a fact it already has', () => {
    const current = { summary: '', facts: [fact('Slim fit')] };
    const merged = mergeContactMemory(current, [fact('slim fit')], {
      summary: '',
      keepSummary: false,
    });
    expect(merged.facts).toHaveLength(1);
  });

  it('never replaces a staff fact with a model fact', () => {
    const staff = fact('Loose fit', { source: 'staff' });
    const merged = mergeContactMemory({ summary: '', facts: [staff] }, [fact('loose fit')], {
      summary: '',
      keepSummary: false,
    });
    expect(merged.facts).toEqual([staff]);
  });

  it('ignores a model fact that claims the staff source', () => {
    const merged = mergeContactMemory(
      { summary: '', facts: [] },
      [fact('Sneaky', { source: 'staff' })],
      { summary: '', keepSummary: false },
    );
    expect(merged.facts).toEqual([]);
  });

  it('keeps a staff-edited summary', () => {
    const merged = mergeContactMemory({ summary: 'By staff', facts: [] }, [], {
      summary: 'By model',
      keepSummary: true,
    });
    expect(merged.summary).toBe('By staff');
  });

  it('drops the oldest model facts first and never a staff fact at 40 facts', () => {
    const staff = Array.from({ length: 5 }, (_, index) =>
      fact(`staff ${index}`, { source: 'staff', at: '2026-01-01T00:00:00.000Z' }),
    );
    const model = Array.from({ length: 38 }, (_, index) =>
      fact(`model ${index}`, { at: minute(index) }),
    );
    const merged = mergeContactMemory({ summary: '', facts: staff }, model, {
      summary: '',
      keepSummary: false,
    });
    expect(merged.facts).toHaveLength(40);
    expect(staff.every((kept) => merged.facts.includes(kept))).toBe(true);
    expect(merged.facts.map(({ value }) => value)).not.toContain('model 0');
    expect(merged.facts.map(({ value }) => value)).toContain('model 37');
  });

  it('fits forty multibyte facts into the serialized byte limit', () => {
    const model = Array.from({ length: 40 }, (_, index) =>
      fact(`${'আমি লাল রঙের জামা পছন্দ করি '.repeat(5).slice(0, 150)}${index}`, {
        at: minute(index),
      }),
    );
    const merged = mergeContactMemory({ summary: '', facts: [] }, model, {
      summary: 'ক'.repeat(600),
      keepSummary: false,
    });
    expect(utf8Bytes(JSON.stringify(merged))).toBeLessThanOrEqual(16_384);
    expect(merged.facts.length).toBeLessThan(40);
  });
});

describe('renderContactMemory', () => {
  const manyFacts = Array.from({ length: 40 }, (_, index) =>
    fact(`রঙ পছন্দ ${index} ${'ক'.repeat(100)}`, {
      at: minute(index),
    }),
  );

  it('leaves memory out when no tokenizer exists', () => {
    expect(renderContactMemory({ summary: 'x', facts: [fact('M')] }, null)).toBeNull();
  });

  it('keeps both limits even when the stored memory is large', () => {
    const rendered = renderContactMemory({ summary: 'ক'.repeat(600), facts: manyFacts }, (text) =>
      Math.ceil(utf8Bytes(text) / 3),
    );
    expect(rendered).not.toBeNull();
    expect(utf8Bytes(rendered!.text)).toBeLessThanOrEqual(1_200);
    expect(rendered!.tokenCount).toBeLessThanOrEqual(300);
  });

  it('enforces the token cap on its own when bytes fit', () => {
    const facts = Array.from({ length: 30 }, (_, index) => fact(`fact ${index}`));
    const rendered = renderContactMemory({ summary: '', facts }, (text) => wordCount(text) * 5);
    expect(rendered!.tokenCount).toBeLessThanOrEqual(300);
    expect(rendered!.text.split('\n').length).toBeLessThan(31);
  });

  it('drops model facts before staff facts', () => {
    const staff = fact('Prefers cotton', { source: 'staff' });
    const rendered = renderContactMemory(
      { summary: '', facts: [fact('Silk'), staff, ...manyFacts] },
      (text) => Math.ceil(utf8Bytes(text) / 3),
    );
    expect(rendered!.text).toContain('Prefers cotton');
  });

  it('returns null for empty memory', () => {
    expect(renderContactMemory({ summary: '', facts: [] }, () => 1)).toBeNull();
  });
});
