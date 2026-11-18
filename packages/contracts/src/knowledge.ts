import { z } from 'zod';

import { type knowledgeKinds, type knowledgeStatuses } from './ai';

export const knowledgeFileBytes = 10 * 1024 * 1024;
export const knowledgeUploadSchema = z.strictObject({
  contentType: z.enum(['application/pdf', 'text/plain']),
  sizeBytes: z.int().min(1).max(knowledgeFileBytes),
});
export type KnowledgeUploadInput = z.infer<typeof knowledgeUploadSchema>;
export type KnowledgeUploadResponse = { fileId: string; uploadUrl: string };

const answer = z
  .string()
  .trim()
  .min(1)
  .max(20_000)
  .refine((text) => !text.includes('\u0000'), 'Remove the null character');
const fileId = z.uuid();

export const createKnowledgeItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('policy'), answer }),
  z.strictObject({ kind: z.literal('file'), fileId }),
]);

export const changeKnowledgeItemSchema = z.union([
  z.strictObject({ answer }),
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
  answer: string | null;
  fileId: string | null;
  status: (typeof knowledgeStatuses)[number];
  factsCount: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeItemListResponse = {
  items: KnowledgeItemResponse[];
  nextCursor: string | null;
};
