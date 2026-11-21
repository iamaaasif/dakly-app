import { z } from 'zod';

import { type knowledgeKinds, type knowledgeStatuses } from './ai';

export const knowledgeFileBytes = 10 * 1024 * 1024;
export const knowledgeUploadSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(['application/pdf', 'text/plain']),
  sizeBytes: z.int().min(1).max(knowledgeFileBytes),
});
export type KnowledgeUploadInput = z.infer<typeof knowledgeUploadSchema>;
export type KnowledgeUploadResponse = { fileId: string; uploadUrl: string };

export const knowledgeAnswerMaxLength = 20_000;
const answer = z
  .string()
  .trim()
  .min(1)
  .max(knowledgeAnswerMaxLength)
  .refine((text) => !text.includes('\u0000'), 'Remove the null character');
const question = z.string().trim().min(1).max(500);
// A few words customers use for this answer; the screen shows at most four.
const keywords = z.array(z.string().trim().min(1).max(40)).max(10);
const fileId = z.uuid();

export const createKnowledgeItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('policy'),
    question: question.optional(),
    answer,
    keywords: keywords.optional(),
  }),
  z.strictObject({ kind: z.literal('file'), fileId }),
]);

export const changeKnowledgeItemSchema = z.union([
  z.strictObject({ question: question.optional(), answer, keywords: keywords.optional() }),
  z.strictObject({ fileId }),
]);

export const listKnowledgeItemsQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateKnowledgeItemInput = z.infer<typeof createKnowledgeItemSchema>;
export type ChangeKnowledgeItemInput = z.infer<typeof changeKnowledgeItemSchema>;
export type ListKnowledgeItemsQuery = z.infer<typeof listKnowledgeItemsQuerySchema>;

export type KnowledgeItemResponse = {
  id: string;
  kind: (typeof knowledgeKinds)[number];
  question: string | null;
  answer: string | null;
  keywords: string[];
  fileId: string | null;
  fileName: string | null;
  sourceUrl: string | null;
  status: (typeof knowledgeStatuses)[number];
  factsCount: number;
  timesUsed: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeItemListResponse = {
  items: KnowledgeItemResponse[];
  nextCursor: string | null;
};

// What the AI reads besides answers and files, for the two cards at the top of the Knowledge tab.
export type KnowledgeSummaryResponse = { productsCount: number; storeRulesCount: number };
