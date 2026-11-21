import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { contactMemorySchema, type ContactMemoryFact } from '@dakly/contracts/contact-memory';

import { mergeMemory } from './contact-memory-merge';
import type { MemoryWork } from './contact-memory.repository';

const at = new Date('2026-11-20T10:00:00Z');
const messageId = randomUUID();
const orderId = randomUUID();

function work(overrides: Partial<MemoryWork> = {}): MemoryWork {
  return {
    contactId: randomUUID(),
    contactVersion: 0,
    conversationVersion: 0,
    checkpoint: null,
    through: { messageId, at },
    memory: { summary: '', facts: [] },
    summaryEditedByStaff: false,
    messages: [{ id: messageId, at, text: 'M size lagbe' }],
    orders: [{ id: orderId, at, deliveryArea: 'Mirpur', items: [] }],
    ...overrides,
  };
}

function fact(overrides: Partial<ContactMemoryFact>): ContactMemoryFact {
  return {
    kind: 'size',
    value: 'M',
    source: 'customer_message',
    sourceId: randomUUID(),
    at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const extraction = (facts: object[], customerSummary = 'Wears M.') => ({
  conversationSummary: 'Asked for size M.',
  customerSummary,
  facts: facts as never,
});

describe('mergeMemory', () => {
  it('keeps a fact that names a message or order sent to the model', () => {
    const memory = mergeMemory(
      work(),
      extraction([
        { kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId },
        { kind: 'delivery_area', value: 'Mirpur', source: 'own_order', sourceId: orderId },
      ]),
    );
    expect(memory.facts.map((it) => [it.kind, it.at])).toEqual([
      ['size', at.toISOString()],
      ['delivery_area', at.toISOString()],
    ]);
    expect(memory.summary).toBe('Wears M.');
  });

  it('drops facts with an id the model was not given, or a delivery area from a message', () => {
    const memory = mergeMemory(
      work(),
      extraction([
        { kind: 'size', value: 'L', source: 'customer_message', sourceId: randomUUID() },
        { kind: 'delivery_area', value: 'Uttara', source: 'customer_message', sourceId: messageId },
        { kind: 'colour', value: 'red', source: 'own_order', sourceId: messageId },
      ]),
    );
    expect(memory.facts).toEqual([]);
  });

  it('learns no delivery area from an order sent to someone else', () => {
    const memory = mergeMemory(
      work({ orders: [{ id: orderId, at, deliveryArea: null, items: [] }] }),
      extraction([
        { kind: 'delivery_area', value: 'Uttara', source: 'own_order', sourceId: orderId },
      ]),
    );
    expect(memory.facts).toEqual([]);
  });

  it('never overwrites or evicts staff facts, and keeps an edited summary', () => {
    const staff = Array.from({ length: 39 }, (_, index) =>
      fact({ kind: 'style', value: `staff ${index}`, source: 'staff' }),
    );
    const existing = fact({ kind: 'colour', value: 'blue' });
    const memory = mergeMemory(
      work({
        memory: { summary: 'Written by staff', facts: [...staff, existing] },
        summaryEditedByStaff: true,
      }),
      extraction([{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }]),
    );
    expect(memory.summary).toBe('Written by staff');
    expect(memory.facts).toHaveLength(40);
    expect(memory.facts.filter((it) => it.source === 'staff')).toHaveLength(39);
    expect(memory.facts.at(-1)?.value).toBe('M');
  });

  it('does not repeat a fact that is already stored', () => {
    const memory = mergeMemory(
      work({ memory: { summary: '', facts: [fact({ value: 'm', source: 'staff' })] } }),
      extraction([{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }]),
    );
    expect(memory.facts).toHaveLength(1);
    expect(memory.facts[0]?.source).toBe('staff');
  });

  it('stays inside the serialized byte limit with multibyte facts', () => {
    const stored = Array.from({ length: 40 }, (_, index) =>
      fact({
        kind: 'style',
        value: 'ই'.repeat(160),
        at: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const memory = mergeMemory(
      work({ memory: { summary: '', facts: stored } }),
      extraction([{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }]),
    );
    expect(contactMemorySchema.safeParse(memory).success).toBe(true);
    expect(memory.facts.at(-1)?.value).toBe('M');
  });
});
