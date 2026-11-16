import { z } from 'zod';

import { bdMobileSchema } from './phone';

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
export type TrackedLinkKind = (typeof trackedLinkKinds)[number];
export const trackedLinkSourceTypes = ['campaign', 'automation', 'post', 'chat', 'order'] as const;
export type TrackedLinkSourceType = (typeof trackedLinkSourceTypes)[number];

// Eight base62 characters: about 47 bits, short enough for an SMS and too many to guess.
export const trackedLinkCodeSchema = z.string().regex(/^[0-9A-Za-z]{8}$/);

// Validate a sendable frozen destination; skipped no-address recipients have no route.
export const campaignRecipientRouteSchema = z.discriminatedUnion('channel', [
  z.strictObject({
    channel: z.literal('sms'),
    channelConnectionId: z.null(),
    contactIdentityId: z.null(),
    destinationAddress: bdMobileSchema,
  }),
  z.strictObject({
    channel: z.literal('messenger'),
    channelConnectionId: z.uuid(),
    contactIdentityId: z.uuid(),
    destinationAddress: z.string().min(1).max(256),
  }),
  z.strictObject({
    channel: z.literal('whatsapp'),
    channelConnectionId: z.uuid(),
    contactIdentityId: z.uuid(),
    destinationAddress: z.string().min(1).max(256),
  }),
]);
export const whatsappQualityRatings = ['green', 'yellow', 'red', 'unknown'] as const;
