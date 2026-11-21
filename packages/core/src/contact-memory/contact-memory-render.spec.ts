import { describe, expect, it } from 'vitest';

import {
  contactMemoryContextMaxBytes,
  contactMemoryContextMaxTokens,
  type ContactMemoryFact,
} from '@dakly/contracts/contact-memory';
import { countOpenAiTokens } from '@dakly/providers/llm/openai/token-counter';

import { renderContactMemory } from './contact-memory-render';

const count = (text: string) => countOpenAiTokens('gpt-6-luna', text);
const bytes = (text: string) => Buffer.byteLength(text);

function fact(index: number, overrides: Partial<ContactMemoryFact> = {}): ContactMemoryFact {
  return {
    kind: 'style',
    value: `পছন্দ ${index}: ঢিলেঢালা সুতির কাপড়, হালকা রঙ, পাঞ্জাবি`,
    source: 'customer_message',
    sourceId: crypto.randomUUID(),
    at: new Date(Date.UTC(2026, 10, 1 + (index % 28))).toISOString(),
    ...overrides,
  };
}

describe('renderContactMemory', () => {
  it('renders the summary and facts when they fit', async () => {
    const text = await renderContactMemory(
      { summary: 'Wears M, likes red.', facts: [fact(1, { kind: 'size', value: 'M' })] },
      count,
    );
    expect(text).toContain('Summary: Wears M, likes red.');
    expect(text).toContain('- size: M');
  });

  it('says nothing for an empty memory', async () => {
    expect(await renderContactMemory({ summary: '', facts: [] }, count)).toBeUndefined();
  });

  it('keeps 40 Bangla facts and a long summary under both caps, measured with the real tokenizer', async () => {
    const facts = Array.from({ length: 40 }, (_, index) => fact(index));
    const text = await renderContactMemory({ summary: 'ক'.repeat(600), facts }, count);
    expect(text).toBeDefined();
    expect(bytes(text ?? '')).toBeLessThanOrEqual(contactMemoryContextMaxBytes);
    expect(await count(text ?? '')).toBeLessThanOrEqual(contactMemoryContextMaxTokens);
  });

  it.each([
    [
      'Banglish',
      (index: number) => `pochondo ${index}: dhilashala sutir kapor, halka rong, panjabi`,
    ],
    [
      'mixed Bangla and English',
      (index: number) => `পছন্দ ${index}: loose cotton কাপড়, light রঙ, panjabi আর kurti`,
    ],
  ])('keeps 40 %s facts and a long summary under both caps', async (_name, value) => {
    const facts = Array.from({ length: 40 }, (_, index) => fact(index, { value: value(index) }));
    const summary = 'bhai size M nen, delivery Sylhet e hoy. '.repeat(15).slice(0, 600);
    const text = await renderContactMemory({ summary, facts }, count);
    expect(text).toBeDefined();
    expect(bytes(text ?? '')).toBeLessThanOrEqual(contactMemoryContextMaxBytes);
    expect(await count(text ?? '')).toBeLessThanOrEqual(contactMemoryContextMaxTokens);
  });

  it('drops model facts, oldest first, before staff facts', async () => {
    const staff = fact(0, { source: 'staff', kind: 'tone', value: 'polite, short answers' });
    const facts = [
      staff,
      ...Array.from({ length: 39 }, (_, index) =>
        fact(index + 1, { at: new Date(Date.UTC(2026, 9, 1 + index)).toISOString() }),
      ),
    ];
    const text = await renderContactMemory({ summary: '', facts }, count);
    expect(text).toContain('polite, short answers');
    expect(text).toContain('পছন্দ 39');
    expect(text).not.toContain('পছন্দ 1:');
  });

  it('leaves memory out when the tokenizer is not known', async () => {
    const text = await renderContactMemory(
      { summary: 'Wears M.', facts: [] },
      async () => undefined,
    );
    expect(text).toBeUndefined();
  });
});
