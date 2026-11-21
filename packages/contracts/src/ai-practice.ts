import { z } from 'zod';

import type { handoverReasons } from './chats';

// Go live runs these one after another inside a single request, so the list stays short.
export const MAX_TEST_QUESTIONS = 5;
export const MIN_TEST_QUESTIONS = 3;

export const testQuestionSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
  expectedAnswer: z.string().trim().min(1).max(500),
});
export const testQuestionsSchema = z.array(testQuestionSchema).max(MAX_TEST_QUESTIONS);
export const saveTestQuestionsSchema = z.strictObject({ questions: testQuestionsSchema });
export const askTestSchema = z.strictObject({ question: z.string().trim().min(1).max(500) });

// Contact ids whose chats the agent answers while a channel is still in practice.
export const testersSchema = z.array(z.uuid()).max(20);
export const saveTestersSchema = z.strictObject({ contactIds: testersSchema });

export type TestQuestion = z.infer<typeof testQuestionSchema>;
export type SaveTestQuestionsInput = z.infer<typeof saveTestQuestionsSchema>;
export type SaveTestersInput = z.infer<typeof saveTestersSchema>;
export type TestersResponse = { contactIds: string[] };
export type AskTestInput = z.infer<typeof askTestSchema>;
export type TestQuestionsResponse = { questions: TestQuestion[] };
// Where a practice reply came from, so the owner knows what to change when it is wrong.
export type TestAnswerSource =
  | { kind: 'answer'; question: string | null }
  | { kind: 'file'; fileName: string | null }
  | { kind: 'products' }
  | { kind: 'store_rules' }
  | { kind: 'general' };
export type TestAnswerResponse =
  | { kind: 'reply'; text: string; source: TestAnswerSource }
  | { kind: 'handover'; reason: (typeof handoverReasons)[number] };
