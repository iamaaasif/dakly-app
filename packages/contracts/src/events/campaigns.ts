import { z } from 'zod';

export const campaignApprovedEventSchema = z.strictObject({
  type: z.literal('campaign.approved'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ campaignId: z.uuid(), status: z.enum(['scheduled', 'sending']) }),
});

// Every recipient is settled and the campaign's credits are charged.
export const campaignSentEventSchema = z.strictObject({
  type: z.literal('campaign.sent'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ campaignId: z.uuid() }),
});
