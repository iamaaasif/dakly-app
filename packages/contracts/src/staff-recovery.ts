import { z } from 'zod';

import { accountRecoveryReasons } from './account-security-events';
import { bdMobileSchema } from './phone';

export const staffRecoveryLookupSchema = z.strictObject({
  identifier: z.union([
    bdMobileSchema,
    z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  ]),
});
export type StaffRecoveryLookup = z.infer<typeof staffRecoveryLookupSchema>;
export type StaffRecoveryTarget = { id: string; name: string };
export const staffRecoveryRequestSchema = z.strictObject({
  targetId: z.uuid(),
  reasonType: z.enum(accountRecoveryReasons),
  reason: z.string().trim().min(10).max(1000),
  checks: z.strictObject({
    nidLastFourMatched: z.literal(true),
    storeDetailsMatched: z.boolean(),
    oldNumberCallbackAttempted: z.literal(true),
  }),
  removeTotp: z.boolean(),
  newPhone: bdMobileSchema.optional(),
  newEmail: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase())
    .optional(),
});
export const staffRecoveryEffectSchema = staffRecoveryRequestSchema.extend({
  action: z.literal('account.recovered'),
  id: z.uuid(),
  staffUserId: z.uuid(),
  staffSessionId: z.uuid(),
  targetName: z.string().max(120),
  credentialState: z.string().regex(/^auth:account-credentials:[0-9a-f]{64}$/),
  confirmBy: z.iso.datetime(),
});
export const staffRecoveryPreviewSchema = z.strictObject({
  effect: staffRecoveryEffectSchema,
  proof: z.string().regex(/^[0-9a-f]{64}$/),
});
export const staffRecoveryCodeSchema = staffRecoveryPreviewSchema.extend({
  channel: z.enum(['phone', 'email']),
});
export const staffRecoveryConfirmationSchema = staffRecoveryPreviewSchema.extend({
  confirmed: z.literal(true),
  phoneCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  emailCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type StaffRecoveryRequest = z.infer<typeof staffRecoveryRequestSchema>;
export type StaffRecoveryEffect = z.infer<typeof staffRecoveryEffectSchema>;
export type StaffRecoveryPreview = z.infer<typeof staffRecoveryPreviewSchema>;
export type StaffRecoveryCode = z.infer<typeof staffRecoveryCodeSchema>;
export type StaffRecoveryConfirmation = z.infer<typeof staffRecoveryConfirmationSchema>;
export type StoreRecoveryHistory = {
  items: {
    id: string;
    userId: string;
    reasonType: (typeof accountRecoveryReasons)[number];
    createdAt: string;
  }[];
  nextCursor: string | null;
};
