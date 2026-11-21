import { z } from 'zod';

// Feature 13, Khata Scanner rules 1 to 3: up to 10 photos or PDF pages of 10 MB each.
export const KHATA_PAGE_MAX_BYTES = 10 * 1024 * 1024;
export const KHATA_CONFIDENCE_THRESHOLD = 85;
export const khataPageContentTypes = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const khataPageContentTypeSchema = z.enum(khataPageContentTypes);
export const khataPageStatuses = ['uploaded', 'reading', 'read', 'unreadable', 'failed'] as const;
export const khataRowKinds = ['sale', 'baki', 'payment'] as const;
export const khataMatchKinds = ['phone', 'similar_phone'] as const;
export const khataFailureCodes = ['allowance', 'model'] as const;

export const createKhataPageSchema = z.strictObject({
  contentType: khataPageContentTypeSchema,
  sizeBytes: z.number().int().positive().max(KHATA_PAGE_MAX_BYTES),
});
export const khataPageListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// What the vision model returns. Everything is text as written on the page, in Bangla, Banglish
// or English letters and digits; code turns it into dates, phones and poisha.
export const khataModelOutputSchema = z.strictObject({
  pageReadable: z.boolean(),
  rows: z.array(
    z.strictObject({
      dateText: z.string().nullable(),
      nameText: z.string(),
      phoneText: z.string().nullable(),
      itemText: z.string().nullable(),
      amountText: z.string(),
      kind: z.enum([...khataRowKinds, 'unclear']),
      confidence: z.int().min(0).max(100),
    }),
  ),
});

export type CreateKhataPageInput = z.infer<typeof createKhataPageSchema>;
export type KhataPageListQuery = z.infer<typeof khataPageListQuerySchema>;
export type KhataModelOutput = z.infer<typeof khataModelOutputSchema>;
export type KhataPageContentType = z.infer<typeof khataPageContentTypeSchema>;
export type KhataPageStatus = (typeof khataPageStatuses)[number];
export type KhataRowKind = (typeof khataRowKinds)[number];
export type KhataMatchKind = (typeof khataMatchKinds)[number];
export type KhataFailureCode = (typeof khataFailureCodes)[number];
export type KhataPageUploadResponse = { pageId: string; uploadUrl: string };
export type KhataRowResponse = {
  id: string;
  rowNumber: number;
  entryDate: string | null;
  name: string;
  phone: string | null;
  item: string | null;
  amountPoisha: number;
  kind: KhataRowKind;
  confidence: number;
  needsCheck: boolean;
  match: { contactId: string; kind: KhataMatchKind } | null;
};
export type KhataPageResponse = {
  id: string;
  status: KhataPageStatus;
  failureCode: KhataFailureCode | null;
  photoUrl: string | null;
  createdAt: string;
  rows: KhataRowResponse[];
};
export type KhataPageListResponse = { items: KhataPageResponse[]; nextCursor: string | null };
