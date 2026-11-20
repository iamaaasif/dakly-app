import { z } from 'zod';

import { calendarDate } from './calendar-date';
import { bdMobileSchema } from './phone';
import { searchText } from './search-text';

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
  'no_credits',
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

// Builder step 0 in feature 09.
export const campaignGoals = [
  'win_back',
  'repeat_purchase',
  'new_collection',
  'vip_offer',
  'discount',
  'clearance',
  'best_sellers',
  'welcome',
  'seasonal',
  'from_scratch',
] as const;

// A draft is saved on every builder step, so the text may still be empty. SMS is the only
// sendable channel until CAMP-7 adds Messenger content.
export const smsCampaignContentSchema = z.strictObject({ text: z.string().trim().max(1000) });
const segmentIdsSchema = z
  .array(z.uuid())
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, 'Choose each segment once');

const campaignDraftShape = {
  name: z.string().trim().min(1).max(100),
  goal: z.enum(campaignGoals).nullable(),
  content: smsCampaignContentSchema,
  includeSegmentIds: segmentIdsSchema,
  excludeSegmentIds: segmentIdsSchema,
  // Null sends on approval.
  scheduledFor: z.iso.datetime().nullable(),
};

export const createCampaignSchema = z.strictObject({
  ...campaignDraftShape,
  channel: z.literal('sms'),
  goal: campaignDraftShape.goal.default(null),
  content: campaignDraftShape.content.default({ text: '' }),
  includeSegmentIds: segmentIdsSchema.default([]),
  excludeSegmentIds: segmentIdsSchema.default([]),
  scheduledFor: campaignDraftShape.scheduledFor.default(null),
});
export const changeCampaignSchema = z
  .strictObject(campaignDraftShape)
  .partial()
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    'Nothing to change',
  );
export const campaignListQuerySchema = z
  .strictObject({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: searchText.max(100).optional(),
    status: z.enum(campaignStatuses).optional(),
    channel: z.enum(campaignChannels).optional(),
    createdFrom: calendarDate.optional(),
    createdThrough: calendarDate.optional(),
  })
  .refine(
    ({ createdFrom, createdThrough }) =>
      !createdFrom || !createdThrough || createdFrom <= createdThrough,
    { path: ['createdThrough'], message: 'End date must be on or after the start date' },
  );

export type CampaignChannel = (typeof campaignChannels)[number];
export type CampaignGoal = (typeof campaignGoals)[number];
export type CampaignStatus = (typeof campaignStatuses)[number];
export type SmsCampaignContent = z.infer<typeof smsCampaignContentSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type ChangeCampaignInput = z.infer<typeof changeCampaignSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type CampaignResponse = {
  id: string;
  name: string;
  goal: CampaignGoal | null;
  channel: CampaignChannel;
  content: SmsCampaignContent;
  includeSegmentIds: string[];
  excludeSegmentIds: string[];
  scheduledFor: string | null;
  status: CampaignStatus;
  startedAt: string | null;
  finishedAt: string | null;
  counts: CampaignCounts;
  attribution?: { orders: string; revenuePoisha: string };
  createdAt: string;
  updatedAt: string;
};
// Sent includes delivered and read. Delivered includes read.
export type CampaignCounts = {
  recipients: number;
  skipped: number;
  sent: number;
  delivered: number;
  read: number;
  tapped: number;
  failed: number;
  countedAt: string | null;
};
export type CampaignListResponse = { items: CampaignResponse[]; nextCursor: string | null };
// SMS is counted in credits, one per part, and has no poisha rate yet, so costPoisha is 0.
export type CampaignEstimateResponse = {
  audienceCount: number;
  skippedByReason: Partial<Record<(typeof recipientSkipReasons)[number], number>>;
  recipientsCount: number;
  smsParts: number;
  smsCredits: number;
  costPoisha: number;
};
