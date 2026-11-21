import type { ZodType } from 'zod';

export type LlmTool = {
  name: string;
  description: string;
  input: ZodType;
};

type LlmToolCall = { id: string; name: string; argumentsJson: string };

export type LlmImage = { contentType: string; bytes: Uint8Array };

export type LlmRequest = {
  model: string;
  instructions: string;
  input: string;
  images?: readonly LlmImage[];
  output: ZodType;
  tools?: readonly LlmTool[];
  timeoutMs: number;
  signal?: AbortSignal;
};

type LlmUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type LlmResult = { usage: LlmUsage; model: string; responseId: string } & (
  { kind: 'output'; output: unknown } | { kind: 'tool_calls'; toolCalls: LlmToolCall[] }
);

export type LlmErrorCode =
  | 'LLM_ABORTED'
  | 'LLM_TIMEOUT'
  | 'LLM_REQUEST_FAILED'
  | 'LLM_RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_INVALID_RESPONSE'
  | 'LLM_INVALID_SCHEMA'
  | 'LLM_INCOMPLETE'
  | 'LLM_REFUSED';

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    readonly usage?: LlmUsage,
  ) {
    super(code);
  }
}

export type LlmEmbeddingRequest = Pick<LlmRequest, 'model' | 'timeoutMs' | 'signal'> & {
  input: readonly string[];
};
export type LlmEmbedding = { model: string; embeddings: number[][]; usage: LlmUsage };

export type LlmTranscriptionRequest = Pick<LlmRequest, 'model' | 'timeoutMs' | 'signal'> & {
  audio: { contentType: string; bytes: Uint8Array };
  // Words the speech is likely to contain, so shop and product names are spelled right.
  hint: string;
};
export type LlmTranscription = { model: string; text: string; usage: LlmUsage };

export type LlmDriver = {
  // The number of tokens this model reads in the text, or undefined when its tokenizer is not known.
  countTokens(model: string, text: string): Promise<number | undefined>;
  transcribe(request: LlmTranscriptionRequest): Promise<LlmTranscription>;
  embed(request: LlmEmbeddingRequest): Promise<LlmEmbedding>;
  respond(request: LlmRequest): Promise<LlmResult>;
};
