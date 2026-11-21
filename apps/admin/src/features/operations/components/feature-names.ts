import type { KillSwitchFeature } from '@dakly/contracts/kill-switches';

export const featureNames: Record<KillSwitchFeature, string> = {
  ai_replies: 'AI replies',
  campaign_sending: 'Campaign sending',
  social_posting: 'Social posting',
};
