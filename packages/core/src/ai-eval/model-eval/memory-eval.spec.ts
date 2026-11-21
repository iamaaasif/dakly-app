import { describe, expect, it } from 'vitest';

import { memoryPromptInput } from '../../contact-memory/contact-memory-prompt-input';
import type { MemoryWork } from '../../contact-memory/contact-memory.repository';
import { memoryCases, scoreMemoryCase } from './memory-eval';

function workFor(texts: string[]): MemoryWork {
  const at = new Date('2026-11-20T10:00:00Z');
  const messages = texts.map((text, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    at,
    text,
  }));
  return {
    contactId: '00000000-0000-4000-8000-0000000000aa',
    contactVersion: 0,
    conversationVersion: 0,
    checkpoint: null,
    through: { messageId: messages[0]?.id ?? '', at },
    memory: { summary: '', facts: [] },
    summaryEditedByStaff: false,
    messages,
    orders: [],
  };
}

const golden = memoryCases.find(({ id }) => id === 'no-gift-recipient')!;

describe('memory eval scoring', () => {
  it('passes an answer that keeps the buyer size and leaves the recipient out', () => {
    const work = workFor(golden.messages);
    const problems = scoreMemoryCase(golden, work, {
      conversationSummary: 'Asked for a gift and a size M.',
      customerSummary: 'Buys size M.',
      facts: [
        { kind: 'size', value: 'M', source: 'customer_message', sourceId: work.messages[1]!.id },
      ],
    });
    expect(problems).toEqual([]);
  });

  it('fails an answer that records the gift recipient or names a message it was not given', () => {
    const work = workFor(golden.messages);
    const problems = scoreMemoryCase(golden, work, {
      conversationSummary: 'Gift for Rima in Sylhet.',
      customerSummary: '',
      facts: [
        {
          kind: 'size',
          value: 'M',
          source: 'customer_message',
          sourceId: '00000000-0000-4000-8000-0000000000ff',
        },
      ],
    });
    expect(problems).toEqual(['missing size', 'kept rima', 'kept sylhet']);
  });

  it('sends the model each customer message with its id', () => {
    const input = memoryPromptInput(workFor(['M size lagbe']));
    expect(input.new_customer_messages).toMatchObject([{ text: 'M size lagbe' }]);
  });

  it('covers Bangla, Banglish and mixed chats and the privacy cases', () => {
    expect(memoryCases.length).toBeGreaterThanOrEqual(9);
    expect(memoryCases.filter(({ forbid }) => forbid.length).length).toBeGreaterThanOrEqual(4);
  });
});
