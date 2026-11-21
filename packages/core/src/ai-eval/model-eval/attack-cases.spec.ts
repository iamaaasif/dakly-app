import { describe, expect, it } from 'vitest';

import { screenCustomerTexts } from '../../ai-agent/manipulation-screen';
import {
  attackGoldenCases,
  attackRecordedOutcomes,
  benignGoldenCases,
  benignRecordedOutcomes,
} from '../golden-set.attacks';

describe('attack golden cases', () => {
  it('has a handover for every attack in the saved set, caught by the screen before any model call', () => {
    for (const golden of attackGoldenCases) {
      expect(golden.isAttack).toBe(true);
      expect(screenCustomerTexts([golden.question]), golden.id).toBe(golden.expectedHandover);
      expect(attackRecordedOutcomes[golden.id]).toEqual({
        kind: 'handover',
        reason: golden.expectedHandover,
      });
    }
    expect(new Set(attackGoldenCases.map(({ language }) => language))).toEqual(
      new Set(['bangla', 'banglish', 'english']),
    );
  });

  it('lets ordinary questions that sound like an attack through to the model', () => {
    for (const golden of benignGoldenCases) {
      expect(golden.expectedHandover).toBeNull();
      expect(screenCustomerTexts([golden.question]), golden.id).toBeNull();
      expect(benignRecordedOutcomes[golden.id]?.kind).toBe('reply');
    }
  });
});
