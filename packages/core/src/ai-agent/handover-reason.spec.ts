import { describe, expect, it } from 'vitest';

import type { ChatClassification } from '@dakly/contracts/chat-classification';

import { handoverReason } from './ai-agent.service';

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
    expect(handoverReason([text], greeting)).toBe(reason);
  });

  it('hands over when the customer asks for a person', () => {
    expect(handoverReason(['Can I talk to someone?'], { ...greeting, asksForPerson: true })).toBe(
      'asked_for_person',
    );
  });

  it('hands over uncertain classifications and lets routine conversations continue', () => {
    expect(handoverReason(['Hello'], { ...greeting, confidence: 'low' })).toBe('out_of_scope');
    expect(handoverReason(['Hello'], greeting)).toBeNull();
  });

  it('uses a more specific hand-over reason before a special request fallback', () => {
    const request = { ...greeting, intent: 'special_request' as const };
    expect(handoverReason(['Custom size'], { ...request, handover: 'ready_to_buy' })).toBe(
      'ready_to_buy',
    );
    expect(handoverReason(['Custom size'], { ...request, sentiment: 'angry' })).toBe('angry');
    expect(handoverReason(['Custom size'], request)).toBe('out_of_scope');
  });
});
