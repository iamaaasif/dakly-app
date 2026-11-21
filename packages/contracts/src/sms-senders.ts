import { z } from 'zod';

import type { smsSenderIdStatuses } from './channels';
import { supportReasonSchema } from './support';

// Operators accept up to 11 letters, numbers and spaces for a masking name (feature 02).
// Operators ask for the trade licence and the owner's NID before they register a name.
export const smsSenderDocumentUploadSchema = z.strictObject({
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export const confirmSmsSenderDocumentSchema = smsSenderDocumentUploadSchema.extend({
  fileId: z.uuid(),
});
export const requestSmsSenderIdSchema = z.strictObject({
  senderName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 ]{3,11}$/, 'Use 3 to 11 English letters, numbers or spaces'),
  tradeLicenceFileId: z.uuid(),
  nidFileId: z.uuid(),
});
export const smsSenderIdListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const smsSenderIdDecisionSchema = z.strictObject({ reason: supportReasonSchema });
export const smsSenderIdDecisionPathSchema = z.enum(['approve', 'reject']);

export type SmsSenderDocumentUploadInput = z.infer<typeof smsSenderDocumentUploadSchema>;
export type ConfirmSmsSenderDocumentInput = z.infer<typeof confirmSmsSenderDocumentSchema>;
export type SmsSenderDocumentUploadResponse = { fileId: string; uploadUrl: string };
export type RequestSmsSenderIdInput = z.infer<typeof requestSmsSenderIdSchema>;
export type SmsSenderIdListQuery = z.infer<typeof smsSenderIdListQuerySchema>;
export type SmsSenderIdDecisionInput = z.infer<typeof smsSenderIdDecisionSchema>;
export type SmsSenderIdDecisionPath = z.infer<typeof smsSenderIdDecisionPathSchema>;
export type SmsSenderIdStatus = (typeof smsSenderIdStatuses)[number];
export type SmsSenderIdResponse = {
  id: string;
  senderName: string;
  status: SmsSenderIdStatus;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};
export type SmsSenderIdListResponse = { items: SmsSenderIdResponse[]; nextCursor: string | null };
export type OpenSmsSenderIdResponse = {
  id: string;
  storeId: string;
  storeName: string;
  senderName: string;
  status: SmsSenderIdStatus;
  createdAt: string;
};
export type OpenSmsSenderIdListResponse = {
  items: OpenSmsSenderIdResponse[];
  nextCursor: string | null;
};
