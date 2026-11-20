import { z } from 'zod';

import { calendarDate } from './calendar-date';
import { bdMobileSchema } from './phone';
import { searchText } from './search-text';

export const campaignChannels = ['whatsapp', 'sms', 'messenger'] as const;
export const messageCategories = ['marketing', 'utility', 'authentication'] as const;
export const campaignStatuses = [
  'draft',
  'waiting_approval',
  'approving',
  'scheduled',
  'sending',
  'paused',
  'sent',
  'cancelled',
  'failed',
] as const;
// The refusals an approval can end with once its job has started; each is an error code of the
// campaigns feature.
export const campaignApprovalFailureCodes = [
  'WALLET_BALANCE_TOO_LOW',
  'CAMPAIGN_NO_RECIPIENTS',
  'CAMPAIGN_SEND_TIME_PASSED',
  'SEGMENT_NOT_FOUND',
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

// A draft is saved on every builder step, so the text may still be empty.
export const smsCampaignContentSchema = z.strictObject({ text: z.string().trim().max(1000) });
// Messenger's button template allows 640 characters of text, 20 per button title and 3 buttons.
// A button sends a postback; the sender writes its payload (CAMP-7).
export const messengerCampaignContentSchema = z.strictObject({
  text: z.string().trim().max(640),
  imageUrl: z
    .url({ protocol: /^https$/ })
    .max(2000)
    .nullable(),
  buttons: z.array(z.strictObject({ title: z.string().trim().min(1).max(20) })).max(3),
});
const segmentIdsSchema = z
  .array(z.uuid())
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, 'Choose each segment once');

const campaignDraftShape = {
  name: z.string().trim().min(1).max(100),
  goal: z.enum(campaignGoals).nullable(),
  includeSegmentIds: segmentIdsSchema,
  excludeSegmentIds: segmentIdsSchema,
  // Null sends on approval.
  scheduledFor: z.iso.datetime().nullable(),
};
const newDraftShape = {
  ...campaignDraftShape,
  goal: campaignDraftShape.goal.default(null),
  includeSegmentIds: segmentIdsSchema.default([]),
  excludeSegmentIds: segmentIdsSchema.default([]),
  scheduledFor: campaignDraftShape.scheduledFor.default(null),
};

// The name and goal every builder starts with, before the channel is chosen.
export const campaignDetailsSchema = z.object({
  name: newDraftShape.name,
  goal: newDraftShape.goal,
});

export const createCampaignSchema = z.discriminatedUnion('channel', [
  z.strictObject({
    ...newDraftShape,
    channel: z.literal('sms'),
    content: smsCampaignContentSchema.default({ text: '' }),
  }),
  z.strictObject({
    ...newDraftShape,
    channel: z.literal('messenger'),
    // The Facebook Page the message goes out from; its identities and windows decide who gets it.
    channelConnectionId: z.uuid(),
    content: messengerCampaignContentSchema.default({ text: '', imageUrl: null, buttons: [] }),
  }),
]);
// The content must fit the campaign's channel; the service checks that, as the channel is not
// part of a change.
export const changeCampaignSchema = z
  .strictObject({
    ...campaignDraftShape,
    content: z.union([smsCampaignContentSchema, messengerCampaignContentSchema]),
    channelConnectionId: z.uuid(),
  })
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
export type CampaignApprovalFailureCode = (typeof campaignApprovalFailureCodes)[number];
export type SmsCampaignContent = z.infer<typeof smsCampaignContentSchema>;
export type MessengerCampaignContent = z.infer<typeof messengerCampaignContentSchema>;
export type CampaignContent = SmsCampaignContent | MessengerCampaignContent;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type ChangeCampaignInput = z.infer<typeof changeCampaignSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type CampaignResponse = {
  id: string;
  name: string;
  goal: CampaignGoal | null;
  channel: CampaignChannel;
  content: CampaignContent;
  // The Facebook Page of a Messenger campaign; null for SMS.
  channelConnectionId: string | null;
  includeSegmentIds: string[];
  excludeSegmentIds: string[];
  scheduledFor: string | null;
  status: CampaignStatus;
  // Set while the status is approving. The total is an upper bound: segments can overlap and
  // exclusions apply, so it can be higher than the final recipient count.
  approval: { checked: number; estimatedTotal: number } | null;
  approvalFailureCode: CampaignApprovalFailureCode | null;
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
// The estimate reads at most 20,000 contacts; isComplete is false when the audience is larger, so
// the counts are a floor. Approval checks the whole audience.
export type CampaignEstimateResponse = {
  isComplete: boolean;
  audienceCount: number;
  skippedByReason: Partial<Record<(typeof recipientSkipReasons)[number], number>>;
  recipientsCount: number;
  smsParts: number;
  smsCredits: number;
  costPoisha: number;
};
