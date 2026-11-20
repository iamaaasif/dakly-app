import { z } from 'zod';

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
  | { kind: 'cannot_answer'; text: string };

export const askDaklyOutputSchema = z.strictObject({ reply: z.string().trim().min(1).max(1500) });
