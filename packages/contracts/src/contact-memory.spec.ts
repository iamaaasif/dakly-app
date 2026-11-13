import { describe, expect, it } from 'vitest';

import * as memoryContract from './contact-memory';

const fact = {
  kind: 'size',
  value: 'M',
  source: 'customer_message',
  sourceId: '018f0bd8-1234-7123-8123-123456789abc',
  at: '2026-11-13T10:00:00.000Z',
};

describe('contact memory contract', () => {
  it('accepts the same fact shape for model output and staff edits', () => {
    const { contactMemorySchema } = memoryContract;
    const memory = {
      summary: 'Prefers blue',
      facts: [fact, { ...fact, source: 'staff', kind: 'colour', value: 'blue' }],
    };
    expect(contactMemorySchema.parse(memory)).toEqual(memory);
  });

  it('bounds fact values and rejects unstructured provenance or unknown fields', () => {
    const { contactMemoryFactSchema } = memoryContract;
    expect(contactMemoryFactSchema.safeParse({ ...fact, value: 'a'.repeat(161) }).success).toBe(
      false,
    );
    expect(
      contactMemoryFactSchema.safeParse({ ...fact, source: { description: 'a'.repeat(5000) } })
        .success,
    ).toBe(false);
    expect(contactMemoryFactSchema.safeParse({ ...fact, sourceId: 'a'.repeat(5000) }).success).toBe(
      false,
    );
    expect(
      contactMemoryFactSchema.safeParse({ ...fact, paymentDetails: 'sensitive' }).success,
    ).toBe(false);
    expect(contactMemoryFactSchema.safeParse({ ...fact, kind: 'religion' }).success).toBe(false);
  });

  it('limits summaries to 600 characters and facts to 40', () => {
    const { contactMemorySchema } = memoryContract;
    expect(contactMemorySchema.safeParse({ summary: 'a'.repeat(601), facts: [] }).success).toBe(
      false,
    );
    expect(
      contactMemorySchema.safeParse({ summary: '', facts: Array.from({ length: 41 }, () => fact) })
        .success,
    ).toBe(false);
  });

  it('caps serialized bytes even when multibyte facts pass individual character limits', () => {
    const { contactMemorySchema } = memoryContract;
    expect(
      contactMemorySchema.safeParse({
        summary: '',
        facts: Array.from({ length: 40 }, () => ({ ...fact, value: 'ক'.repeat(160) })),
      }).success,
    ).toBe(false);
  });

  it('requires both the rendered byte budget and measured token budget', () => {
    const { renderedContactMemorySchema } = memoryContract;
    expect(
      renderedContactMemorySchema.safeParse({ text: 'Blue, size M', tokenCount: 5 }).success,
    ).toBe(true);
    expect(
      renderedContactMemorySchema.safeParse({ text: 'small text', tokenCount: 301 }).success,
    ).toBe(false);
    expect(
      renderedContactMemorySchema.safeParse({ text: 'ক'.repeat(401), tokenCount: 300 }).success,
    ).toBe(false);
  });
});
