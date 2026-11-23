import { describe, expect, it } from 'vitest';

import { defaultShopRules, refuseToolCall, shopRulesFrom } from './shop-rules';

describe('shopRulesFrom', () => {
  it('gives a shop that never saved the defaults', () => {
    expect(shopRulesFrom({ abilities: {}, handoverRules: {} })).toEqual(defaultShopRules);
  });

  it('keeps what the owner saved and fills the switches added since', () => {
    const rules = shopRulesFrom({
      abilities: { showProducts: false, confirmOrders: false },
      handoverRules: { refundsAndExchanges: false },
      replyLanguage: 'bn',
      extraRules: '  Call every customer apu.  ',
    });
    expect(rules).toEqual({
      replyLanguage: 'bn',
      extraRules: 'Call every customer apu.',
      handover: { ...defaultShopRules.handover, refundsAndExchanges: false },
      showProducts: false,
      takeOrders: true,
      confirmOrders: false,
    });
  });

  it('treats blank extra rules as none', () => {
    expect(
      shopRulesFrom({ abilities: {}, handoverRules: {}, extraRules: '  ' }).extraRules,
    ).toBeNull();
  });
});

describe('refuseToolCall', () => {
  const call = (name: string, args: object = {}) => ({ name, argumentsJson: JSON.stringify(args) });

  it('never refuses a discount or an angry customer hand-over, which no switch lets the AI take', () => {
    const allOff = {
      ...defaultShopRules,
      handover: {
        damagedOrWrong: false,
        refundsAndExchanges: false,
        specialRequests: false,
        discounts: false,
      },
    };
    for (const reason of ['discount', 'angry', 'asked_for_person', 'other', 'out_of_scope'])
      expect(refuseToolCall(allOff, call('hand_over', { reason })), reason).toBeUndefined();
  });

  it('refuses a refund or complaint hand-over only while its switch is off', () => {
    const noComplaints = {
      ...defaultShopRules,
      handover: { ...defaultShopRules.handover, damagedOrWrong: false },
    };
    expect(refuseToolCall(noComplaints, call('hand_over', { reason: 'complaint' }))?.kind).toBe(
      'error',
    );
    expect(refuseToolCall(noComplaints, call('hand_over', { reason: 'refund' }))).toBeUndefined();
    expect(
      refuseToolCall(defaultShopRules, call('hand_over', { reason: 'complaint' })),
    ).toBeUndefined();
  });

  it('survives a hand-over call with unreadable arguments', () => {
    expect(
      refuseToolCall(defaultShopRules, { name: 'hand_over', argumentsJson: '{' }),
    ).toBeUndefined();
  });

  it('hands over a buyer when taking orders is off, and confirming is off with it', () => {
    const noOrders = { ...defaultShopRules, takeOrders: false };
    expect(refuseToolCall(noOrders, call('draft_order'))).toEqual({
      kind: 'handover',
      reason: 'ready_to_buy',
    });
    expect(refuseToolCall(noOrders, call('confirm_order'))?.kind).toBe('handover');
    expect(refuseToolCall(defaultShopRules, call('draft_order'))).toBeUndefined();
  });
});
