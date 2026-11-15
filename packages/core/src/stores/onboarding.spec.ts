import { describe, expect, it } from 'vitest';

import { onboardingExtensions, recommendedPlans } from './onboarding';

describe('onboarding', () => {
  it.each([
    { answers: ['social_media'] as const, want: ['sales', 'chats', 'social_auto_post'] },
    { answers: ['online_store'] as const, want: ['sales'] },
    { answers: ['shop_with_pos', 'shop_without_pos'] as const, want: [] },
    {
      answers: ['social_media', 'online_store', 'social_media'] as const,
      want: ['sales', 'chats', 'social_auto_post'],
    },
  ])('enables only release 1 extensions for $answers', ({ answers, want }) => {
    expect(onboardingExtensions([...answers])).toEqual(want);
  });
  it('recommends paid plans from reported customer size', () => {
    expect(recommendedPlans).toEqual({
      under_500: 'starter',
      '500_to_2000': 'starter',
      '2000_to_10000': 'growth',
      over_10000: 'pro',
    });
  });
});
