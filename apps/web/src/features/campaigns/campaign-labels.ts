import type { CampaignChannel, CampaignGoal, CampaignStatus } from '@dakly/contracts/campaigns';
import type { BadgeProps } from '@dakly/ui/badge';

export const campaignChannelLabels: Record<CampaignChannel, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  messenger: 'Facebook Messenger',
};

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: 'Draft',
  waiting_approval: 'Waiting for approval',
  approving: 'Approving',
  scheduled: 'Scheduled',
  sending: 'Sending',
  paused: 'Paused',
  sent: 'Sent',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export const campaignStatusColors: Record<CampaignStatus, BadgeProps['variant']> = {
  draft: 'neutral',
  waiting_approval: 'warning',
  approving: 'info',
  scheduled: 'warning',
  sending: 'info',
  paused: 'warning',
  sent: 'success',
  cancelled: 'neutral',
  failed: 'danger',
};

export const campaignGoalLabels: Record<CampaignGoal, string> = {
  win_back: 'Win back customers',
  repeat_purchase: 'Increase repeat purchases',
  new_collection: 'Promote a new collection',
  vip_offer: 'Offer for VIP customers',
  discount: 'Announce a discount',
  clearance: 'Clearance',
  best_sellers: 'Promote best sellers',
  welcome: 'Welcome new customers',
  seasonal: 'Seasonal campaign',
  from_scratch: 'Start from scratch',
};

// Campaigns that have started sending show their results, not the builder summary.
const resultStatuses: CampaignStatus[] = ['sending', 'paused', 'sent', 'failed', 'cancelled'];
export const hasCampaignResults = (status: CampaignStatus) => resultStatuses.includes(status);
