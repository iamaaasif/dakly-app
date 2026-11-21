import { z } from 'zod';

import { supportReasonSchema } from './support';

export const killSwitchFeatures = ['ai_replies', 'campaign_sending', 'social_posting'] as const;
export type KillSwitchFeature = (typeof killSwitchFeatures)[number];

export const killSwitchFeatureSchema = z.enum(killSwitchFeatures);

// Resuming also needs a reason so the audit row explains why the pause ended.
export const changeKillSwitchSchema = z.strictObject({
  paused: z.boolean(),
  reason: supportReasonSchema,
  confirmed: z.literal(true),
});
export type ChangeKillSwitchInput = z.infer<typeof changeKillSwitchSchema>;

export type KillSwitchResponse = {
  id: string;
  feature: KillSwitchFeature;
  storeId: string | null;
  reason: string;
  pausedByStaffId: string;
  pausedAt: string;
};
export type KillSwitchListResponse = { switches: KillSwitchResponse[] };
export type KillSwitchChangeResponse = {
  feature: KillSwitchFeature;
  storeId: string | null;
  paused: boolean;
};
