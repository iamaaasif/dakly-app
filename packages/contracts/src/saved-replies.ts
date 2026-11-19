import { z } from 'zod';

export const createSavedReplySchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  shortcut: z.string().trim().min(1).max(80).nullable().optional(),
});

export const updateSavedReplySchema = createSavedReplySchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Change at least one field');

export const savedReplyListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSavedReplyInput = z.infer<typeof createSavedReplySchema>;
export type UpdateSavedReplyInput = z.infer<typeof updateSavedReplySchema>;
export type SavedReplyListQuery = z.infer<typeof savedReplyListQuerySchema>;

export type SavedReply = {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  createdAt: string;
  updatedAt: string;
};
