import { describe, expect, it } from 'vitest';

import { defaultHandoverRules as switchesOn } from '@dakly/contracts/ai-agent-settings';
import type { ChatClassification } from '@dakly/contracts/chat-classification';

import { handoverReason } from './handover-reason';

// The model has already replied twice, so a complaint, refund or angry message goes to a person.
const defaultHandoverRules = { ...switchesOn, shopReplies: 2 };
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
      shopReplies: 2,
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
    expect(handoverReason(['50 pcs bulk'], request, switchesOn)).toBe('out_of_scope');
    expect(
      handoverReason(['50 pcs bulk'], request, { ...switchesOn, specialRequests: false }),
    ).toBeNull();
  });
});

describe('a complaint, refund or angry message at the start of a chat', () => {
  it.each([
    ['apnara fraud! ager order ashe nai', { sentiment: 'angry' as const }],
    ['product ta vanga, taka ferot chai', { intent: 'exchange' as const }],
    ['kapor chera ashche', { intent: 'complaint' as const, handover: 'complaint' as const }],
  ])('goes to the model first: %s', (text, change) => {
    expect(handoverReason([text], { ...greeting, ...change }, switchesOn)).toBeNull();
  });

  it('still goes to a person at once when the customer asks for one', () => {
    expect(handoverReason(['agent chai'], { ...greeting, asksForPerson: true }, switchesOn)).toBe(
      'asked_for_person',
    );
  });

  it('goes to a person once the shop has replied twice', () => {
    expect(
      handoverReason(
        ['kothay amar order'],
        { ...greeting, sentiment: 'angry' },
        defaultHandoverRules,
      ),
    ).toBe('angry');
  });
});

describe('a question the classifier cannot place', () => {
  it('hands over a message that is still unclear after the shop asked what it means', () => {
    const unclear = { ...greeting, intent: 'other' as const, handover: 'out_of_scope' as const };
    expect(handoverReason(['oi jinish ta'], unclear, { ...switchesOn, shopReplies: 1 })).toBe(
      'out_of_scope',
    );
  });

  it.each(['out_of_scope', 'other'] as const)(
    'keeps %s a hand-over only for a custom order or an attempt on the rules, never for another question',
    (handover) => {
      const question = { ...greeting, intent: 'other' as const, handover };
      expect(handoverReason(['apnader phone number ta den'], question, switchesOn)).toBe(
        handover === 'other' ? 'other' : null,
      );
    },
  );

  it('does not read ছাড়া (without) or plain policy/question words as a hand-over', () => {
    expect(handoverReason(['ডেলিভারি ছাড়া দাম কত?'], greeting, defaultHandoverRules)).toBeNull();
    expect(handoverReason(['exchange policy ki?'], greeting, defaultHandoverRules)).toBeNull();
    expect(handoverReason(['refund policy ki?'], greeting, defaultHandoverRules)).toBeNull();
    expect(handoverReason(['damaged hole ki korbo?'], greeting, defaultHandoverRules)).toBeNull();
    expect(
      handoverReason(['discount niye kichu janaben?'], greeting, defaultHandoverRules),
    ).toBeNull();
  });

  it.each([
    ['taka ferot chai', 'refund'],
    ['refund den', 'refund'],
    ['টাকা ফেরত চাই', 'refund'],
  ] as const)('still hands over explicit refund demand "%s"', (text, reason) => {
    expect(handoverReason([text], greeting, defaultHandoverRules)).toBe(reason);
  });
});

describe('a customer ready to buy', () => {
  const buyer = { ...greeting, intent: 'order' as const, handover: 'ready_to_buy' as const };

  it('goes to the model when the shop takes orders, and to a person when it does not', () => {
    const rules = defaultHandoverRules;
    expect(
      handoverReason(['ji, confirm korun'], buyer, { ...rules, takesOrders: true }),
    ).toBeNull();
    expect(handoverReason(['ji, confirm korun'], buyer, { ...rules, takesOrders: false })).toBe(
      'ready_to_buy',
    );
  });
});
