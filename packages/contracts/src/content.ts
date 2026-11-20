import { z } from 'zod';

import { searchText } from './search-text';
import { contentKinds, contentLanguages } from './social';

const profileText = searchText.max(1000).nullable();
const profileWords = z.array(searchText.max(80)).max(50);

export const brandProfileSchema = z.strictObject({
  voice: profileText,
  audience: profileText,
  preferredWords: profileWords,
  wordsToAvoid: profileWords,
  callToActionBn: profileText,
  callToActionEn: profileText,
});

const pieceSchema = z.strictObject({
  kind: z.enum(contentKinds),
  language: z.enum(contentLanguages),
  body: z
    .string()
    .max(20_000)
    .refine((body) => body.trim().length > 0, 'Enter some text')
    .refine((body) => !body.includes('\u0000'), 'Remove the null character'),
});

export const createContentPieceSchema = pieceSchema
  .extend({
    sourcePieceId: z.uuid().optional(),
    aiRunId: z.uuid().optional(),
  })
  .refine((input) => !input.sourcePieceId || !input.aiRunId, 'Choose one source');
export const updateContentPieceSchema = pieceSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Change at least one field');
export const contentPieceListQuerySchema = z.strictObject({
  kind: pieceSchema.shape.kind.optional(),
  language: pieceSchema.shape.language.optional(),
  cursor: z
    .templateLiteral([z.iso.datetime(), '_', z.uuid()])
    .refine((cursor) => !cursor.startsWith('0000-'), 'Invalid cursor timestamp')
    .transform((cursor) => {
      const [createdAt, id] = cursor.split('_');
      return { createdAt, id };
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type BrandProfile = z.infer<typeof brandProfileSchema>;
export type CreateContentPieceInput = z.infer<typeof createContentPieceSchema>;
export type UpdateContentPieceInput = z.infer<typeof updateContentPieceSchema>;
export type ContentPieceListQuery = z.infer<typeof contentPieceListQuerySchema>;
export type ContentPiece = z.infer<typeof pieceSchema> & {
  id: string;
  createdByUserId: string | null;
  isAiWritten: boolean;
  aiRunId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ContentPieceList = { items: ContentPiece[]; nextCursor: string | null };
