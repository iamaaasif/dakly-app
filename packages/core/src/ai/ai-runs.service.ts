import { Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import {
  LlmError,
  type LlmDriver,
  type LlmEmbedding,
  type LlmEmbeddingRequest,
  type LlmErrorCode,
  type LlmRequest,
  type LlmResult,
} from '@dakly/providers/llm/llm-driver';

import { Clock } from '../platform/clock';
import { AiGate } from './ai-gate';
import { AiRunsRepository, type AiRun } from './ai-runs.repository';
import { LLM_DRIVER, type AiConfig } from './ai.config';

type Attempt<T> = Omit<LlmRequest, 'output'> & { output: ZodType<T> };
type ToolCalls = Extract<LlmResult, { kind: 'tool_calls' }>['toolCalls'];
type AttemptFailureCode = LlmErrorCode | 'AI_OUTPUT_MISMATCH';
type AttemptResult<T> =
  | { kind: 'output'; output: T }
  | { kind: 'tool_calls'; toolCalls: ToolCalls }
  | { kind: 'failure'; code: AttemptFailureCode };
export type AiAttempt<T> = AttemptResult<T> & { aiRunId: string };

const providerFailures = new Set<LlmErrorCode>([
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_REQUEST_FAILED',
  'LLM_INVALID_RESPONSE',
]);

const emptyUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
type Price = AiConfig['prices'][string];
type RunContext = Pick<AiRun, 'tier' | 'purpose' | 'promptVersion'> & { price?: Price };

@Injectable()
export class AiRunsService {
  constructor(
    @Inject(LLM_DRIVER) private readonly driver: LlmDriver,
    @Inject(AiRunsRepository) private readonly repository: AiRunsRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AiGate) private readonly gate: AiGate,
  ) {}

  async attempt<T>(
    storeId: string,
    request: Attempt<T>,
    context: RunContext,
  ): Promise<AiAttempt<T>> {
    const startedAt = this.clock.now();
    const { result, usage, model } = await this.callModel(request);
    const aiRunId = await this.record(storeId, context, {
      model,
      startedAt,
      usage,
      code: result.kind === 'failure' ? result.code : undefined,
    });
    return { ...result, aiRunId };
  }

  async embed(
    storeId: string,
    request: LlmEmbeddingRequest,
    price: Price | undefined,
  ): Promise<LlmEmbedding> {
    const startedAt = this.clock.now();
    const context: RunContext = {
      tier: 'embed',
      purpose: 'embedding',
      promptVersion: 'embedding.v1',
      price,
    };
    let result: LlmEmbedding;
    try {
      result = await this.driver.embed(request);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      if (providerFailures.has(error.code)) await this.gate.recordFailure();
      await this.record(storeId, context, {
        model: request.model,
        startedAt,
        usage: error.usage ?? emptyUsage,
        code: error.code,
      });
      throw error;
    }
    await this.record(storeId, context, { ...result, startedAt });
    return result;
  }

  private record(
    storeId: string,
    { price, ...context }: RunContext,
    {
      model,
      startedAt,
      usage,
      code,
    }: {
      model: string;
      startedAt: Date;
      usage: LlmResult['usage'];
      code?: AttemptFailureCode;
    },
  ): Promise<string> {
    return this.repository.insert(storeId, {
      ...context,
      model,
      createdAt: startedAt,
      latencyMs: Math.max(0, this.clock.now().getTime() - startedAt.getTime()),
      ...usage,
      costMicroUsd: cost(usage, price),
      outcome: code ? failureOutcome(code) : 'completed',
      errorCode: code ?? null,
    });
  }

  private async callModel<T>(request: Attempt<T>): Promise<{
    result: AttemptResult<T>;
    usage: LlmResult['usage'];
    model: string;
  }> {
    let model: LlmResult;
    try {
      model = await this.driver.respond(request);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      if (providerFailures.has(error.code)) await this.gate.recordFailure();
      return {
        result: { kind: 'failure', code: error.code },
        usage: error.usage ?? emptyUsage,
        model: request.model,
      };
    }
    if (model.kind === 'tool_calls') {
      return {
        result: { kind: 'tool_calls', toolCalls: model.toolCalls },
        usage: model.usage,
        model: model.model,
      };
    }
    const parsed = await request.output.safeParseAsync(model.output);
    const result: AttemptResult<T> = parsed.success
      ? { kind: 'output', output: parsed.data }
      : { kind: 'failure', code: 'AI_OUTPUT_MISMATCH' };
    return { result, usage: model.usage, model: model.model };
  }
}

function failureOutcome(code: AttemptFailureCode): AiRun['outcome'] {
  if (code === 'LLM_TIMEOUT') return 'timeout';
  if (code === 'AI_OUTPUT_MISMATCH') return 'failed_check';
  return 'failed';
}

function cost(usage: LlmResult['usage'], price: Price | undefined): number {
  if (!price) return 0;
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  const total =
    BigInt(uncached) * BigInt(price.input) +
    BigInt(usage.cachedInputTokens) * BigInt(price.cachedInput) +
    BigInt(usage.outputTokens) * BigInt(price.output);
  return Number((total + 500_000n) / 1_000_000n);
}
