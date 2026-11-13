export const campaignChannels = ['whatsapp', 'sms', 'messenger'] as const;
export const messageCategories = ['marketing', 'utility', 'authentication'] as const;
export const campaignStatuses = [
  'draft',
  'waiting_approval',
  'scheduled',
  'sending',
  'paused',
  'sent',
  'cancelled',
  'failed',
] as const;
export const campaignPauseReasons = [
  'manual',
  'balance',
  'whatsapp_quality',
  'template_rejected',
  'provider_error',
] as const;
export const recipientStatuses = [
  'skipped',
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'cancelled',
] as const;
export const recipientSkipReasons = [
  'no_consent',
  'not_customer',
  'blocked',
  'no_address',
  'over_plan_limit',
  'frequency_cap',
  'window_closed',
  'meta_user_limit',
  'do_not_call',
  'daily_reach_limit',
] as const;
export const templateStatuses = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paused',
  'disabled',
] as const;
export const trackedLinkKinds = ['redirect', 'sms_opt_out'] as const;
export const trackedLinkSourceTypes = ['campaign', 'automation', 'post', 'chat', 'order'] as const;
