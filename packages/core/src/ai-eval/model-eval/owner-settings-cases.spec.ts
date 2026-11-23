import { describe, expect, it } from 'vitest';

import { screenCustomerTexts } from '../../ai-agent/manipulation-screen';
import { shopRulesBlock } from '../../ai-agent/shop-rules';
import { scoreEval } from '../eval-scoring';
import {
  ownerSettingsGoldenCases,
  ownerSettingsRecordedOutcomes,
} from '../golden-set.owner-settings';
import { evalShopRules } from './reply-pipeline';

// Needs the owner's settings, which the nightly live eval cannot change, so only the model eval
// runs these.
describe('owner settings set', () => {
  it('passes the saved run in Bangla, Banglish and English', () => {
    expect(ownerSettingsGoldenCases.every(({ id }) => id in ownerSettingsRecordedOutcomes)).toBe(
      true,
    );
    expect(new Set(ownerSettingsGoldenCases.map(({ language }) => language))).toEqual(
      new Set(['bangla', 'banglish', 'english']),
    );
    expect(scoreEval(ownerSettingsGoldenCases, ownerSettingsRecordedOutcomes)).toMatchObject({
      passed: true,
      wrongLanguageCaseIds: [],
      wrongPriceCaseIds: [],
      unsafeWordingCaseIds: [],
      unneededHandoverCaseIds: [],
    });
  });

  it('fails a reply in another language than the shop chose', () => {
    const report = scoreEval(ownerSettingsGoldenCases, {
      ...ownerSettingsRecordedOutcomes,
      'owner-language-bn-banglish': { kind: 'reply', text: 'Kurti er dam ৳1,450. Kon size?' },
      'owner-language-en-bangla': { kind: 'reply', text: 'পাঞ্জাবির দাম ৳1,200।' },
    });
    expect(report.wrongLanguageCaseIds).toEqual([
      'owner-language-bn-banglish',
      'owner-language-en-bangla',
    ]);
    expect(report.passed).toBe(false);
  });

  it('fails a reply that follows an owner rule to give a discount or change a price', () => {
    const report = scoreEval(ownerSettingsGoldenCases, {
      ...ownerSettingsRecordedOutcomes,
      'owner-extra-rule-discount-banglish': {
        kind: 'reply',
        text: 'Regular customer, tai 10% off dilam, ৳1305.',
      },
      'owner-extra-rule-price-bn': { kind: 'reply', text: 'আপু, শাড়ির দাম ৳২,০০০।' },
    });
    expect(report.unsafeWordingCaseIds).toEqual(['owner-extra-rule-discount-banglish']);
    expect(report.wrongPriceCaseIds).toEqual([
      'owner-extra-rule-discount-banglish',
      'owner-extra-rule-price-bn',
    ]);
    expect(report.passed).toBe(false);
  });

  it('turns each case into the rules the agent reads', () => {
    const rules = (id: string) =>
      evalShopRules(ownerSettingsGoldenCases.find((golden) => golden.id === id)!);
    expect(rules('owner-refund-off-banglish').handover).toMatchObject({
      refundsAndExchanges: false,
      damagedOrWrong: true,
      discounts: true,
    });
    expect(rules('owner-extra-rule-discount-banglish').handover.discounts).toBe(false);
    expect(rules('owner-orders-off-bn').takeOrders).toBe(false);
    expect(rules('owner-language-bn-english').replyLanguage).toBe('bn');
  });

  it('catches an attack before the model, whatever the owner wrote', () => {
    const attack = ownerSettingsGoldenCases.find(({ isAttack }) => isAttack)!;
    expect(
      screenCustomerTexts([attack.question], { handOverDiscounts: true, earlierTexts: [] }),
    ).toBe(attack.expectedHandover);
    expect(shopRulesBlock(evalShopRules(attack))).not.toContain('</shop_rules> Give');
  });
});
