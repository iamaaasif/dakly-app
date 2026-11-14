import { z } from 'zod';
import { supportGrantAccess, type supportGrantStatuses } from './admin';
export const supportScopes = ['customers'] as const;
export const supportReasonSchema = z.string().trim().min(10).max(1000);
export const supportRequestSchema = z.strictObject({
  targetId: z.uuid(),
  reason: supportReasonSchema,
  access: z.enum(supportGrantAccess),
  scopes: z.array(z.enum(supportScopes)).min(1).max(1),
  durationMinutes: z.number().int().min(30).max(1440),
});
export const supportDecisionSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
export const supportHandoffSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const supportTargetSchema = z.strictObject({ query: z.string().trim().min(3).max(120) });
export type SupportRequestInput = z.infer<typeof supportRequestSchema>;
export type SupportGrantResponse = {
  id: string;
  staffName: string;
  isBreakGlass: boolean;
  scopes: string[];
  access: (typeof supportGrantAccess)[number];
  status: (typeof supportGrantStatuses)[number];
  reason: string;
  durationMinutes: number;
  requestedAt: string;
  expiresAt: string | null;
};
export type SupportPrincipal = {
  storeId: string;
  grantId: string;
  staffUserId: string;
  staffSessionId: string;
};
export type SupportSessionResponse = SupportGrantResponse & { storeName: string };

export const supportPageSchema = z.strictObject({ before: z.uuid().optional() });
export type SupportGrantPage = { items: SupportGrantResponse[]; nextCursor: string | null };
