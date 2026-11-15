import type { CreateStoreInput } from '@dakly/contracts/stores';

export function onboardingExtensions(answers: CreateStoreInput['howYouSell']): string[] {
  if (answers.includes('social_media')) return ['sales', 'chats', 'social_auto_post'];
  if (answers.includes('online_store')) return ['sales'];
  return [];
}
export const recommendedPlans: Record<CreateStoreInput['customerListSize'], string> = {
  under_500: 'starter',
  '500_to_2000': 'starter',
  '2000_to_10000': 'growth',
  over_10000: 'pro',
};
