import { Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import type { aiRunPurposes } from '@dakly/contracts/ai';
import type { LlmTool } from '@dakly/providers/llm/llm-driver';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { UsageService, type ConsumeUsageInput } from '../usage/usage.service';
import { AiGate } from './ai-gate';
import { AiRunsService, type AiAttempt } from './ai-runs.service';
import { AI_CONFIG, aiTimeoutMs, type AiConfig, type AiTier } from './ai.config';
import { aiError } from './ai.errors';

export type AiRequest<T> = {
  tier: AiTier;
  purpose: (typeof aiRunPurposes)[number];
  prompt: { version: string; instructions: string };
  input: string;
  output: ZodType<T>;
  tools?: readonly LlmTool[];
  signal?: AbortSignal;
  usage?: Omit<ConsumeUsageInput, 'quantity' | 'unit'> & {
    unit: Exclude<ConsumeUsageInput['unit'], 'ai_conversation'>;
  };
};

type GateFailure =
  'AI_PAUSED' | 'AI_STORE_BUSY' | 'USAGE_ALLOWANCE_EXCEEDED' | 'LLM_ABORTED' | 'LLM_TIMEOUT';
type AiResult<T> = AiAttempt<T> | { kind: 'failure'; code: GateFailure };

@Injectable()
export class AiService {
  constructor(
    @Inject(AiRunsService) private readonly runs: AiRunsService,
    @Inject(AiGate) private readonly gate: AiGate,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async run<T>(storeId: string, request: AiRequest<T>): Promise<AiResult<T>> {
    if (this.transaction.isOpen()) throw aiError('AI_INSIDE_TRANSACTION');
    if (request.signal?.aborted) return { kind: 'failure', code: 'LLM_ABORTED' };
    const deadline = this.clock.now().getTime() + aiTimeoutMs;
    const permit = await this.gate.acquire(storeId);
    if (permit.kind === 'paused') return { kind: 'failure', code: 'AI_PAUSED' };
    if (permit.kind === 'busy') return { kind: 'failure', code: 'AI_STORE_BUSY' };

    const result = await this.runWithRetry(storeId, request, deadline).finally(() =>
      this.gate.release(storeId, permit.ticket),
    );
    if (result.kind !== 'output' || !request.usage) return result;
    return this.billOutput(storeId, request.usage, result, request.signal);
  }

  private async billOutput<T>(
    storeId: string,
    usage: NonNullable<AiRequest<T>['usage']>,
    result: AiResult<T>,
    signal?: AbortSignal,
  ): Promise<AiResult<T>> {
    if (signal?.aborted) return { kind: 'failure', code: 'LLM_ABORTED' };
    try {
      await this.usage.consume(storeId, { ...usage, quantity: 1 });
    } catch (error) {
      if (error instanceof AppError && error.code === 'USAGE_ALLOWANCE_EXCEEDED')
        return { kind: 'failure', code: 'USAGE_ALLOWANCE_EXCEEDED' };
      throw error;
    }
    return result;
  }

  private async runWithRetry<T>(
    storeId: string,
    request: AiRequest<T>,
    deadline: number,
  ): Promise<AiResult<T>> {
    if (await this.gate.isPaused()) return { kind: 'failure', code: 'AI_PAUSED' };
    const firstTimeout = deadline - this.clock.now().getTime();
    if (firstTimeout <= 0) return { kind: 'failure', code: 'LLM_TIMEOUT' };
    const first = await this.attempt(storeId, request, firstTimeout);
    if (first.kind !== 'failure' || first.code !== 'AI_OUTPUT_MISMATCH') return first;
    if (await this.gate.isPaused()) return first;
    const retryTimeout = deadline - this.clock.now().getTime();
    if (retryTimeout <= 0 || request.signal?.aborted) return first;
    return this.attempt(storeId, request, retryTimeout);
  }

  private async attempt<T>(
    storeId: string,
    request: AiRequest<T>,
    timeoutMs: number,
  ): Promise<AiAttempt<T>> {
    const model = this.config.models[request.tier];
    return this.runs.attempt(
      storeId,
      {
        model,
        instructions: request.prompt.instructions,
        input: request.input,
        output: request.output,
        tools: request.tools,
        signal: request.signal,
        timeoutMs,
      },
      {
        tier: request.tier,
        purpose: request.purpose,
        promptVersion: request.prompt.version,
        price: Object.hasOwn(this.config.prices, model) ? this.config.prices[model] : undefined,
      },
    );
  }
}
