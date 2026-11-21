import { z } from 'zod';

// Feature 13, Khata Scanner rules 1 to 3: up to 10 photos or PDF pages of 10 MB each.
export const KHATA_PAGE_MAX_BYTES = 10 * 1024 * 1024;
export const KHATA_CONFIDENCE_THRESHOLD = 85;
export const khataPageContentTypes = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const khataPageContentTypeSchema = z.enum(khataPageContentTypes);
export const khataPageStatuses = ['uploaded', 'reading', 'read', 'unreadable', 'failed'] as const;
export const khataRowKinds = ['sale', 'baki', 'payment'] as const;
export const khataMatchKinds = ['phone', 'similar_phone'] as const;
export const khataImportStatuses = ['done', 'undone'] as const;
export const khataRowOutcomes = ['imported', 'skipped'] as const;
export const khataFailureCodes = ['allowance', 'model'] as const;

export const createKhataPageSchema = z.strictObject({
  contentType: khataPageContentTypeSchema,
  sizeBytes: z.number().int().positive().max(KHATA_PAGE_MAX_BYTES),
});

// Rule 3: the owner decides every row. A row under the confidence threshold is imported only when
// the owner lists it as `import`. A merge target is the owner's own choice (rule 4).
export const importKhataPageSchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        rowId: z.uuid(),
        action: z.enum(['import', 'skip']),
        // Required to import a row under the confidence threshold (SHOP-R7).
        isChecked: z.boolean().optional(),
        mergeContactId: z.uuid().optional(),
      }),
    )
    .min(1)
    .max(500),
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

export type ImportKhataPageInput = z.infer<typeof importKhataPageSchema>;
export type KhataRowOutcome = (typeof khataRowOutcomes)[number];
export type KhataImportStatus = (typeof khataImportStatuses)[number];
export type CreateKhataPageInput = z.infer<typeof createKhataPageSchema>;
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
export type KhataImportResponse = {
  id: string;
  pageId: string;
  status: KhataImportStatus;
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  customersCreated: number;
  createdAt: string;
  undoUntil: string;
};
