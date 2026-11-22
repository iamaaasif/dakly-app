import { z } from 'zod';

import type { ProductBulkEditRow } from './product-bulk-edits';
import type { ProductResponse } from './products';
import { searchText } from './search-text';

const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_TURNS = 6;

export const askDaklyRequestSchema = z.strictObject({
  question: searchText.max(MAX_QUESTION_LENGTH),
  // Earlier turns of this panel session, so a follow-up such as "and last week?" makes sense.
  history: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        text: searchText.max(2000),
      }),
    )
    .max(MAX_HISTORY_TURNS)
    .default([]),
});
export type AskDaklyRequest = z.infer<typeof askDaklyRequestSchema>;

export type AskDaklyAnswer =
  | {
      kind: 'answer';
      text: string;
      // What the numbers came from, such as "Orders, last 30 days".
      sources: string[];
      creditsLeft: number;
    }
  | { kind: 'cannot_answer'; text: string }
  | { kind: 'product_draft'; text: string; draft: AssistantProductDraft; creditsLeft: number }
  | { kind: 'product_change'; text: string; change: AssistantProductChange; creditsLeft: number };

// What the owner said for a new product. The Add product page fills itself from this; nothing is saved.
export const assistantProductDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  pricePoisha: z.number().int().positive().optional(),
  category: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  options: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(100),
        values: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
      }),
    )
    .max(3)
    .default([]),
  // Pieces of each size or colour combination.
  stockEach: z.number().int().min(0).optional(),
});
export type AssistantProductDraft = z.infer<typeof assistantProductDraftSchema>;

// Products the shop matched by name, with the new values it worked out. The bulk edit review shows
// old and new; nothing applies until the owner presses Apply.
export type AssistantProductChange = { products: ProductResponse[]; rows: ProductBulkEditRow[] };

export const askDaklyOutputSchema = z.strictObject({ reply: z.string().trim().min(1).max(1500) });
