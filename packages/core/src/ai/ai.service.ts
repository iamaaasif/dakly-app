import { Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import type { aiRunPurposes } from '@dakly/contracts/ai';
import type {
  LlmErrorCode,
  LlmImage,
  LlmTool,
  LlmTranscriptionRequest,
} from '@dakly/providers/llm/llm-driver';

import { Clock } from '../platform/clock';
import { hasDatabaseTransactionScope } from '../platform/database/scoped-transactions';
import { AppError } from '../platform/errors/app-error';
import { UsageService, type ConsumeUsageInput } from '../usage/usage.service';
import { AiGate } from './ai-gate';
import { AiRunsService, type AiAttempt } from './ai-runs.service';
import { AI_CONFIG, aiTimeoutMs, type AiConfig, type AiTier } from './ai.config';
import { aiError } from './ai.errors';
import { retryTransientFailure } from './transient-retry';

// Reading a customer's photo or voice note draws from the chat allowance, one unit each.
const usageUnits = {
  content: 'ai_content',
  ask: 'ai_ask',
  describe_image: 'ai_conversation',
} as const;
type BillablePurpose = keyof typeof usageUnits;
type AiPurpose = (typeof aiRunPurposes)[number];

export type AiRequest<T> = {
  tier: AiTier;
  prompt: { version: string; instructions: string };
  input: string;
  images?: readonly LlmImage[];
  output: ZodType<T>;
  tools?: readonly LlmTool[];
  signal?: AbortSignal;
} & (
  | { purpose: 'content'; usageReference: string; usageQuantity: number }
  | { purpose: 'ask' | 'describe_image'; usageReference: string }
  | { purpose: Exclude<AiPurpose, BillablePurpose>; usageReference?: never }
);

type GateFailure =
  'AI_PAUSED' | 'AI_STORE_BUSY' | 'USAGE_ALLOWANCE_EXCEEDED' | 'LLM_ABORTED' | 'LLM_TIMEOUT';
type AiResult<T> = AiAttempt<T> | { kind: 'failure'; code: GateFailure };

@Injectable()
export class AiService {
  constructor(
    @Inject(AiRunsService) private readonly runs: AiRunsService,
    @Inject(AiGate) private readonly gate: AiGate,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async run<T>(storeId: string, request: AiRequest<T>): Promise<AiResult<T>> {
    if (hasDatabaseTransactionScope()) throw aiError('AI_INSIDE_TRANSACTION');
    if (request.signal?.aborted) return { kind: 'failure', code: 'LLM_ABORTED' };
    const deadline = this.clock.now().getTime() + aiTimeoutMs;
    const permit = await this.gate.acquire(storeId);
    if (permit.kind === 'paused') return { kind: 'failure', code: 'AI_PAUSED' };
    if (permit.kind === 'busy') return { kind: 'failure', code: 'AI_STORE_BUSY' };

    const result = await this.runWithRetry(storeId, request, deadline).finally(() =>
      this.gate.release(storeId, permit.ticket),
    );
    if (result.kind !== 'output' || request.usageReference === undefined) return result;
    return this.billOutput(
      storeId,
      {
        unit: usageUnits[request.purpose],
        reference: request.usageReference,
        quantity: request.purpose === 'content' ? request.usageQuantity : 1,
      },
      result,
      request.signal,
    );
  }

  // Counts with the tokenizer of the model this tier runs on. undefined means no tokenizer is
  // known, and the caller must leave the text out rather than guess.
  countTokens(tier: AiTier, text: string): Promise<number | undefined> {
    return this.runs.countTokens(this.config.models[tier], text);
  }

  get embeddingModel(): string {
    return this.config.embeddingModel;
  }

  async embed(storeId: string, input: readonly string[], signal?: AbortSignal) {
    if (hasDatabaseTransactionScope()) throw aiError('AI_INSIDE_TRANSACTION');
    const permit = await this.gate.acquire(storeId);
    if (permit.kind === 'paused') throw aiError('AI_PAUSED');
    if (permit.kind === 'busy') throw aiError('AI_STORE_BUSY');
    const model = this.config.embeddingModel;
    try {
      return await this.runs.embed(
        storeId,
        { model, input, timeoutMs: aiTimeoutMs, signal },
        Object.hasOwn(this.config.prices, model) ? this.config.prices[model] : undefined,
      );
    } finally {
      await this.gate.release(storeId, permit.ticket);
    }
  }

  async transcribe(
    storeId: string,
    request: Pick<LlmTranscriptionRequest, 'audio' | 'hint'> & {
      usageReference: string;
      signal?: AbortSignal;
    },
  ): Promise<
    { kind: 'output'; text: string } | { kind: 'failure'; code: GateFailure | LlmErrorCode }
  > {
    if (hasDatabaseTransactionScope()) throw aiError('AI_INSIDE_TRANSACTION');
    if (request.signal?.aborted) return { kind: 'failure', code: 'LLM_ABORTED' };
    const permit = await this.gate.acquire(storeId);
    if (permit.kind === 'paused') return { kind: 'failure', code: 'AI_PAUSED' };
    if (permit.kind === 'busy') return { kind: 'failure', code: 'AI_STORE_BUSY' };
    const model = this.config.transcribeModel;
    const { usageReference, ...llmRequest } = request;
    let result;
    try {
      result = await this.runs.transcribe(
        storeId,
        { ...llmRequest, model, timeoutMs: aiTimeoutMs },
        Object.hasOwn(this.config.prices, model) ? this.config.prices[model] : undefined,
      );
    } finally {
      await this.gate.release(storeId, permit.ticket);
    }
    if (result.kind !== 'output') return result;
    return this.billOutput(
      storeId,
      { unit: 'ai_conversation', reference: usageReference, quantity: 1 },
      result,
      request.signal,
    );
  }

  private async billOutput<R>(
    storeId: string,
    usage: ConsumeUsageInput,
    result: R,
    signal?: AbortSignal,
  ): Promise<R | { kind: 'failure'; code: GateFailure }> {
    if (signal?.aborted) return { kind: 'failure', code: 'LLM_ABORTED' };
    try {
      await this.usage.consume(storeId, usage);
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
    const first = await retryTransientFailure(await this.attempt(storeId, request, firstTimeout), {
      deadline,
      now: () => this.clock.now().getTime(),
      isStopped: async () => request.signal?.aborted === true || (await this.gate.isPaused()),
      attempt: (timeoutMs) => this.attempt(storeId, request, timeoutMs, true),
    });
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
    isRetry = false,
  ): Promise<AiAttempt<T>> {
    const model = this.config.models[request.tier];
    return this.runs.attempt(
      storeId,
      {
        model,
        instructions: request.prompt.instructions,
        input: request.input,
        images: request.images,
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
      isRetry,
    );
  }
}
