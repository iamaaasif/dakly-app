import { describe, expect, it } from 'vitest';

import { defaultHandoverRules } from '@dakly/contracts/ai-agent-settings';
import type { ChatClassification } from '@dakly/contracts/chat-classification';

import { handoverReason } from './handover-reason';

const holdPrice = { ...defaultHandoverRules, discounts: false };

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
    expect(handoverReason([text], greeting, defaultHandoverRules)).toBe(reason);
  });

  it('hands over when the customer asks for a person', () => {
    expect(
      handoverReason(
        ['Can I talk to someone?'],
        { ...greeting, asksForPerson: true },
        defaultHandoverRules,
      ),
    ).toBe('asked_for_person');
  });

  it('leaves an unclear message to the model, which asks one question first', () => {
    expect(
      handoverReason(['ota koto?'], { ...greeting, confidence: 'low' }, defaultHandoverRules),
    ).toBeNull();
    expect(handoverReason(['Hello'], greeting, defaultHandoverRules)).toBeNull();
  });

  it.each(['last price koto?', 'কিছু ছাড় দেওয়া যাবে?', 'discount pabo vai?'])(
    'lets the model hold the price on "%s" in a shop that keeps its price',
    (text) => {
      const price = { ...greeting, intent: 'price' as const, handover: 'discount' as const };
      expect(handoverReason([text], price, holdPrice)).toBeNull();
      expect(handoverReason([text], price, defaultHandoverRules)).toBe('discount');
    },
  );

  it('hands over a special request only for a more specific reason', () => {
    const request = { ...greeting, intent: 'special_request' as const };
    expect(
      handoverReason(
        ['Custom size'],
        { ...request, handover: 'ready_to_buy' },
        defaultHandoverRules,
      ),
    ).toBe('ready_to_buy');
    expect(
      handoverReason(['Custom size'], { ...request, sentiment: 'angry' }, defaultHandoverRules),
    ).toBe('angry');
    expect(handoverReason(['Custom size'], request, defaultHandoverRules)).toBeNull();
  });

  it.each([
    ['I want a refund', 'refundsAndExchanges'],
    ['এটা ফেরত দেব', 'refundsAndExchanges'],
    ['kapor chera ashche', 'damagedOrWrong'],
    ['This looks fake', 'damagedOrWrong'],
  ] as const)('lets the model answer "%s" when its switch is off', (text, switchName) => {
    const rules = { ...defaultHandoverRules, [switchName]: false };
    expect(handoverReason([text], greeting, rules)).toBeNull();
    expect(handoverReason([text], greeting, defaultHandoverRules)).not.toBeNull();
  });

  it('drops the classifier hand-over for a refund or complaint whose switch is off, not for another reason', () => {
    const refund = { ...greeting, intent: 'other' as const, handover: 'refund' as const };
    const noRefunds = { ...defaultHandoverRules, refundsAndExchanges: false };
    expect(handoverReason(['ok'], refund, noRefunds)).toBeNull();
    expect(handoverReason(['ok'], { ...refund, handover: 'complaint' }, noRefunds)).toBe(
      'complaint',
    );
    expect(handoverReason(['ok'], { ...refund, sentiment: 'angry' }, noRefunds)).toBe('angry');
  });

  it('still hands over an angry customer or a request for a person with every switch off', () => {
    const off = {
      damagedOrWrong: false,
      refundsAndExchanges: false,
      specialRequests: false,
      discounts: false,
    };
    expect(
      handoverReason(['refund now'], { ...greeting, intent: 'exchange', asksForPerson: true }, off),
    ).toBe('asked_for_person');
    expect(
      handoverReason(['refund now'], { ...greeting, intent: 'exchange', sentiment: 'angry' }, off),
    ).toBe('angry');
  });

  it('drops the out_of_scope hand-over for a custom order when special requests are off', () => {
    const request = {
      ...greeting,
      intent: 'special_request' as const,
      handover: 'out_of_scope' as const,
    };
    expect(handoverReason(['50 pcs bulk'], request, defaultHandoverRules)).toBe('out_of_scope');
    expect(
      handoverReason(['50 pcs bulk'], request, { ...defaultHandoverRules, specialRequests: false }),
    ).toBeNull();
  });
});
