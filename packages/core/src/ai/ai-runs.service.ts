import { Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import {
  LlmError,
  type LlmDriver,
  type LlmErrorCode,
  type LlmRequest,
  type LlmResult,
} from '@dakly/providers/llm/llm-driver';

import { Clock } from '../platform/clock';
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

const emptyUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
type Price = AiConfig['prices'][string];
type RunContext = Pick<AiRun, 'tier' | 'purpose' | 'promptVersion'> & { price?: Price };

@Injectable()
export class AiRunsService {
  constructor(
    @Inject(LLM_DRIVER) private readonly driver: LlmDriver,
    @Inject(AiRunsRepository) private readonly repository: AiRunsRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async attempt<T>(
    storeId: string,
    request: Attempt<T>,
    context: RunContext,
  ): Promise<AiAttempt<T>> {
    const startedAt = this.clock.now();
    const { result, usage, model } = await this.callModel(request);
    const aiRunId = await this.repository.insert(storeId, {
      tier: context.tier,
      purpose: context.purpose,
      model,
      promptVersion: context.promptVersion,
      createdAt: startedAt,
      latencyMs: Math.max(0, this.clock.now().getTime() - startedAt.getTime()),
      ...usage,
      costMicroUsd: cost(usage, context.price),
      outcome: result.kind === 'failure' ? failureOutcome(result.code) : 'completed',
      errorCode: result.kind === 'failure' ? result.code : null,
    });
    return { ...result, aiRunId };
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
      const failure = error instanceof LlmError ? error : new LlmError('LLM_REQUEST_FAILED');
      return {
        result: { kind: 'failure', code: failure.code },
        usage: failure.usage ?? emptyUsage,
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
    const parsed = await request.output.safeParseAsync(model.output).catch(() => undefined);
    const result: AttemptResult<T> = parsed?.success
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
