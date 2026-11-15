import { z } from 'zod';

import { supportReasonSchema } from './support';

export const breakGlassRequestSchema = z.strictObject({
  targetId: z.uuid(),
  reason: supportReasonSchema,
  category: z.enum(['security_incident', 'legal_request']),
});
export const breakGlassEffectSchema = breakGlassRequestSchema.extend({
  action: z.literal('support.break_glass_opened'),
  id: z.uuid(),
  staffUserId: z.uuid(),
  staffSessionId: z.uuid(),
  shopName: z.string().min(1).max(200),
  access: z.literal('read'),
  scopes: z.tuple([z.literal('customers')]),
  durationMinutes: z.literal(30),
  expiresAt: z.iso.datetime(),
  confirmBy: z.iso.datetime(),
});
export const breakGlassConfirmationSchema = z.strictObject({
  effect: breakGlassEffectSchema,
  proof: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export const staffAlertRetrySchema = z.strictObject({ reason: supportReasonSchema });
export type BreakGlassRequest = z.infer<typeof breakGlassRequestSchema>;
export type BreakGlassEffect = z.infer<typeof breakGlassEffectSchema>;
export type BreakGlassPreview = { effect: BreakGlassEffect; proof: string };
export type BreakGlassConfirmation = z.infer<typeof breakGlassConfirmationSchema>;
export type StaffAlert = {
  id: string;
  staffName: string;
  storeId: string | null;
  reason: string;
  createdAt: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  error: string | null;
};
export type StaffAlertPage = { items: StaffAlert[]; nextCursor: string | null };
