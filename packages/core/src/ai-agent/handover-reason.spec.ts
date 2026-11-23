import { describe, expect, it } from 'vitest';

import type { ChatClassification } from '@dakly/contracts/chat-classification';

import { handoverReason } from './handover-reason';

const greeting: ChatClassification = {
  intent: 'greeting',
  language: 'en',
  sentiment: 'neutral',
  asksForPerson: false,
  confidence: 'high',
  handover: null,
};

describe('handoverReason', () => {
  it.each([
    ['I want a refund', 'refund'],
    ['এটা ফেরত দেব', 'refund'],
    ['kapor chera ashche', 'complaint'],
    ['can I get a discount?', 'discount'],
    ['This looks fake', 'complaint'],
  ] as const)('hands over "%s" despite a different model classification', (text, reason) => {
    expect(handoverReason([text], greeting, true)).toBe(reason);
  });

  it('hands over when the customer asks for a person', () => {
    expect(
      handoverReason(['Can I talk to someone?'], { ...greeting, asksForPerson: true }, true),
    ).toBe('asked_for_person');
  });

  it('leaves an unclear message to the model, which asks one question first', () => {
    expect(handoverReason(['ota koto?'], { ...greeting, confidence: 'low' }, true)).toBeNull();
    expect(handoverReason(['Hello'], greeting, true)).toBeNull();
  });

  it.each(['last price koto?', 'কিছু ছাড় দেওয়া যাবে?', 'discount pabo vai?'])(
    'lets the model hold the price on "%s" in a shop that keeps its price',
    (text) => {
      const price = { ...greeting, intent: 'price' as const, handover: 'discount' as const };
      expect(handoverReason([text], price, false)).toBeNull();
      expect(handoverReason([text], price, true)).toBe('discount');
    },
  );

  it('hands over a special request only for a more specific reason', () => {
    const request = { ...greeting, intent: 'special_request' as const };
    expect(handoverReason(['Custom size'], { ...request, handover: 'ready_to_buy' }, true)).toBe(
      'ready_to_buy',
    );
    expect(handoverReason(['Custom size'], { ...request, sentiment: 'angry' }, true)).toBe('angry');
    expect(handoverReason(['Custom size'], request, true)).toBeNull();
  });
});
