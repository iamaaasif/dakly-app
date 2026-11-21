import { z } from 'zod';

import type { aiRatings } from './chats';
import {
  knowledgeAnswerSchema,
  knowledgeKeywordsSchema,
  knowledgeQuestionSchema,
} from './knowledge';

export const aiRatingReasons = [
  'wrong_information',
  'wrong_price_or_stock',
  'too_long',
  'not_our_tone',
  'missed_the_question',
  'should_have_handed_over',
] as const;

// A thumbs-down asks why, so a bad rating always carries one reason. Only the rating and the
// reason are saved; the reply and the customer's words stay in the chat.
export const rateAiReplySchema = z.discriminatedUnion('rating', [
  z.strictObject({ rating: z.literal('good') }),
  z.strictObject({ rating: z.literal('bad'), reason: z.enum(aiRatingReasons) }),
]);

// The right answer for a bad reply. It becomes a taught answer, so it takes the same fields as one;
// the question is required because Dakly finds the answer by what the customer wrote.
export const fixAiReplySchema = z.strictObject({
  question: knowledgeQuestionSchema,
  answer: knowledgeAnswerSchema,
  keywords: knowledgeKeywordsSchema.optional(),
});

export const aiFeedbackFilters = ['needs_fixing', 'bad', 'good', 'all'] as const;
export const aiFeedbackQuerySchema = z.strictObject({
  filter: z.enum(aiFeedbackFilters).default('bad'),
});

export type FixAiReplyInput = z.infer<typeof fixAiReplySchema>;
export type RateAiReplyInput = z.infer<typeof rateAiReplySchema>;
export type AiFeedbackQuery = z.infer<typeof aiFeedbackQuerySchema>;

export type AiFeedbackItem = {
  messageId: string;
  rating: (typeof aiRatings)[number];
  reason: (typeof aiRatingReasons)[number] | null;
  customerName: string | null;
  customerQuestion: string | null;
  replyText: string | null;
  // When the team wrote the right answer and Dakly learned it; null until then.
  fixedAt: string | null;
  ratedAt: string;
};

export type AiFeedbackResponse = {
  summary: {
    // Null until something is rated.
    helpfulPercent: number | null;
    goodCount: number;
    badCount: number;
    fixedCount: number;
    commonProblems: { reason: (typeof aiRatingReasons)[number]; count: number }[];
  };
  // The newest 50 that match the filter.
  items: AiFeedbackItem[];
};
