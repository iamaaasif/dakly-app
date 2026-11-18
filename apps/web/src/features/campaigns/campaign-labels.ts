import type { CampaignChannel, CampaignStatus } from '@dakly/contracts/campaigns';
import type { BadgeProps } from '@dakly/ui/badge';

export const campaignChannelLabels: Record<CampaignChannel, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  messenger: 'Facebook Messenger',
};

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: 'Draft',
  waiting_approval: 'Waiting for approval',
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
  scheduled: 'warning',
  sending: 'info',
  paused: 'warning',
  sent: 'success',
  cancelled: 'neutral',
  failed: 'danger',
};
