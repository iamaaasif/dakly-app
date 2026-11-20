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

export type TestQuestion = z.infer<typeof testQuestionSchema>;
export type SaveTestQuestionsInput = z.infer<typeof saveTestQuestionsSchema>;
export type AskTestInput = z.infer<typeof askTestSchema>;
export type TestQuestionsResponse = { questions: TestQuestion[] };
export type TestAnswerResponse =
  { kind: 'reply'; text: string } | { kind: 'handover'; reason: (typeof handoverReasons)[number] };
