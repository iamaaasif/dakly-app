import type { ZodType } from 'zod';

export type LlmTool = {
  name: string;
  description: string;
  input: ZodType;
};

type LlmToolCall = { id: string; name: string; argumentsJson: string };

export type LlmRequest = {
  model: string;
  instructions: string;
  input: string;
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

export type LlmDriver = {
  respond(request: LlmRequest): Promise<LlmResult>;
};
