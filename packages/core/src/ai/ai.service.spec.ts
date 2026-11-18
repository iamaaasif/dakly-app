import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import { LlmError, type LlmResult } from '@dakly/providers/llm/llm-driver';

import type { StoreTransaction } from '../platform/database/store-transaction';
import type { UsageService } from '../usage/usage.service';
import type { AiGate } from './ai-gate';
import type { AiRun, AiRunsRepository } from './ai-runs.repository';
import { AiRunsService } from './ai-runs.service';
import type { AiConfig } from './ai.config';
import { AiService, type AiRequest } from './ai.service';

const storeId = '463028b4-0b79-4467-8d7b-ba5d86736827';
const model = 'gpt-6.1-terra';
const schema = z.object({ reply: z.string() });
const request: AiRequest<z.infer<typeof schema>> = {
  tier: 'reply',
  purpose: 'chat_reply',
  prompt: { version: 'chat-reply.v1', instructions: 'Answer in Bangla.' },
  input: 'দাম কত?',
  output: schema,
};

const billedRequest: AiRequest<z.infer<typeof schema>> = {
  ...request,
  tier: 'writer',
  purpose: 'content',
  usage: { unit: 'ai_content', reference: 'draft-123' },
};

const config: AiConfig = {
  models: { reply: model, writer: model, vision: model, fast: 'gpt-6-luna' },
  prices: { [model]: { input: 2_000_000, cachedInput: 250_000, output: 8_000_000 } },
};
const usage = { inputTokens: 1700, cachedInputTokens: 1024, outputTokens: 20 };
const reply: LlmResult = {
  kind: 'output',
  output: { reply: '১০০ টাকা।' },
  usage,
  responseId: 'response-1',
  model,
};

describe('AiService', () => {
  it('records a healthy run and returns the parsed reply', async () => {
    const { service, runs } = fixture([reply]);

    await expect(service.run(storeId, request)).resolves.toEqual({
      kind: 'output',
      output: { reply: '১০০ টাকা।' },
      aiRunId: 'run-1',
    });
    expect(runs).toEqual([
      expect.objectContaining({
        tier: 'reply',
        model,
        promptVersion: 'chat-reply.v1',
        ...usage,
        costMicroUsd: 1768,
        outcome: 'completed',
      }),
    ]);
  });

  it('records both attempts after a schema mismatch and uses one allowance unit', async () => {
    const { service, runs, used } = fixture([{ ...reply, output: { reply: 100 } }, reply]);

    await expect(service.run(storeId, billedRequest)).resolves.toMatchObject({
      kind: 'output',
      aiRunId: 'run-2',
    });
    expect(runs.map((run) => run.outcome)).toEqual(['failed_check', 'completed']);
    expect(used.size).toBe(1);
  });

  it('returns a typed failure after the second schema mismatch', async () => {
    const bad = { ...reply, output: { reply: 100 } };
    const { service, runs } = fixture([bad, bad, reply]);

    await expect(service.run(storeId, request)).resolves.toEqual({
      kind: 'failure',
      code: 'AI_OUTPUT_MISMATCH',
      aiRunId: 'run-2',
    });
    expect(runs).toHaveLength(2);
  });

  it('records timeouts without trying the model a second time', async () => {
    const { service, runs } = fixture([new LlmError('LLM_TIMEOUT'), reply]);

    await expect(service.run(storeId, request)).resolves.toMatchObject({
      kind: 'failure',
      code: 'LLM_TIMEOUT',
    });
    expect(runs.map((run) => run.outcome)).toEqual(['timeout']);
  });

  it('leaves the allowance untouched on a billed timeout or final schema mismatch', async () => {
    const bad = { ...reply, output: { reply: 100 } };
    const { service, used } = fixture([new LlmError('LLM_TIMEOUT'), bad, bad]);

    await expect(service.run(storeId, billedRequest)).resolves.toMatchObject({
      kind: 'failure',
      code: 'LLM_TIMEOUT',
    });
    await expect(service.run(storeId, billedRequest)).resolves.toMatchObject({
      kind: 'failure',
      code: 'AI_OUTPUT_MISMATCH',
    });
    expect(used.size).toBe(0);
  });

  it('records chat calls without consuming a conversation unit', async () => {
    const { service, used } = fixture([reply]);

    await expect(service.run(storeId, request)).resolves.toMatchObject({ kind: 'output' });
    expect(used.size).toBe(0);
  });

  it('stops a first dispatch when the circuit opens during admission', async () => {
    const { service, runs } = fixture([reply], { pausedWhileAdmitting: true });

    await expect(service.run(storeId, request)).resolves.toEqual({
      kind: 'failure',
      code: 'AI_PAUSED',
    });
    expect(runs).toEqual([]);
  });

  it('opens the circuit on provider failures even when the run table is unavailable', async () => {
    const unavailable = new LlmError('LLM_UNAVAILABLE');
    const { service } = fixture([unavailable, unavailable, unavailable], { failWrites: true });

    for (let index = 0; index < 3; index += 1)
      await expect(service.run(storeId, request)).rejects.toThrow('Run insert failed');
    await expect(service.run(storeId, request)).resolves.toEqual({
      kind: 'failure',
      code: 'AI_PAUSED',
    });
  });

  it('refuses to run inside a store transaction', async () => {
    const { service, runs, used } = fixture([reply], { transactionOpen: true });

    await expect(service.run(storeId, request)).rejects.toMatchObject({
      code: 'AI_INSIDE_TRANSACTION',
    });
    expect(runs).toEqual([]);
    expect(used.size).toBe(0);
  });
});

function fixture(
  script: (LlmResult | Error)[],
  options: { transactionOpen?: boolean; pausedWhileAdmitting?: boolean; failWrites?: boolean } = {},
) {
  let failures = 0;
  const runs: AiRun[] = [];
  const used = new Map<string, { id: string }>();
  const repo = {
    async insert(_storeId: string, run: AiRun) {
      if (options.failWrites) throw new Error('Run insert failed');
      runs.push(run);
      return `run-${runs.length}`;
    },
  } as AiRunsRepository;
  const usageService = {
    async consume(_storeId: string, { reference }: NonNullable<AiRequest<unknown>['usage']>) {
      const event = used.get(reference) ?? { id: reference };
      used.set(reference, event);
      return event;
    },
  } as UsageService;
  const gate = {
    acquire: async () =>
      failures >= 3 ? { kind: 'paused' } : { kind: 'acquired', ticket: 'ticket-1' },
    isPaused: async () => options.pausedWhileAdmitting === true,
    release: async () => undefined,
    async recordFailure() {
      failures += 1;
    },
  } as unknown as AiGate;
  const clock = { now: () => new Date('2026-11-18T15:00:00Z') };
  const transaction = { isOpen: () => options.transactionOpen === true } as StoreTransaction;
  const driver = new FakeLlmDriver(script);
  const service = new AiService(
    new AiRunsService(driver, repo, clock, gate),
    gate,
    usageService,
    transaction,
    config,
    clock,
  );
  return { service, runs, used };
}
