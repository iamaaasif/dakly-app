import { z } from 'zod';

// Approving a draft starts the job that freezes its audience. The approval time says which
// approval, so a job left from an earlier one does nothing.
export const campaignApprovalStartedEventSchema = z.strictObject({
  type: z.literal('campaign.approval_started'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ campaignId: z.uuid(), approvedAt: z.iso.datetime() }),
});

export const campaignApprovedEventSchema = z.strictObject({
  type: z.literal('campaign.approved'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ campaignId: z.uuid(), status: z.enum(['scheduled', 'sending']) }),
});

export const campaignSentEventSchema = z.strictObject({
  type: z.literal('campaign.sent'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ campaignId: z.uuid() }),
});
