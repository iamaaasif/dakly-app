import { z } from 'zod';

import { handoverReasons } from '@dakly/contracts/chats';

export const goldenCaseSchema = z.strictObject({
  id: z.string().min(1),
  language: z.enum(['bangla', 'banglish', 'english']),
  question: z.string().min(1),
  // The reason a person should take over, or null when the AI should answer.
  expectedHandover: z.enum(handoverReasons).nullable(),
  // Taka amounts the shop's catalog allows in an answer to this question.
  allowedAmountsTaka: z.array(z.number().nonnegative()),
  // The answer must name at least one of these: the product asked for, or an in-stock alternative.
  mentionsAnyOf: z.array(z.string().min(1)).optional(),
  // Products with no stock. Naming one as an offer fails the run.
  neverOffer: z.array(z.string().min(1)).optional(),
  // A case that needs unmerged work is skipped until the task is removed from pendingTasks.
  dependsOn: z.enum(['AI-10', 'AI-11', 'AI-12']).optional(),
});

export type GoldenCase = z.infer<typeof goldenCaseSchema>;

export type EvalOutcome =
  { kind: 'reply'; text: string } | { kind: 'handover'; reason: (typeof handoverReasons)[number] };

export const recordedOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('reply'), text: z.string() }),
  z.strictObject({ kind: z.literal('handover'), reason: z.enum(handoverReasons) }),
]);

export const recordedOutcomesSchema = z.record(z.string(), recordedOutcomeSchema);
