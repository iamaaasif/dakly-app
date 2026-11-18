import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FakeLlmDriver } from './fake-llm-driver';
import type { LlmRequest, LlmResult } from './llm-driver';

const responseMetadata = { model: 'test-model', responseId: 'test-response' };

const request: LlmRequest = {
  model: 'test-model',
  instructions: 'Reply in the customer’s language.',
  input: 'দাম কত?',
  output: z.object({ reply: z.string() }),
  timeoutMs: 1000,
};

describe('FakeLlmDriver', () => {
  it('returns each scripted model response in turn', async () => {
    const usage = { inputTokens: 4, cachedInputTokens: 0, outputTokens: 3 };
    const first: LlmResult = {
      ...responseMetadata,
      kind: 'output',
      output: { reply: 'একটু অপেক্ষা করুন।' },
      usage,
    };
    const second: LlmResult = {
      ...responseMetadata,
      kind: 'output',
      output: { reply: '১০০ টাকা।' },
      usage,
    };
    const driver = new FakeLlmDriver([first, second]);

    await expect(driver.respond(request)).resolves.toEqual(first);
    await expect(driver.respond(request)).resolves.toEqual(second);
    await expect(driver.respond(request)).rejects.toThrow('No scripted response left');
  });

  it('returns a scripted provider error', async () => {
    const driver = new FakeLlmDriver([new Error('Unavailable')]);

    await expect(driver.respond(request)).rejects.toThrow('Unavailable');
  });

  it('leaves the scripted response available after an already cancelled call', async () => {
    const result: LlmResult = {
      ...responseMetadata,
      kind: 'output',
      output: { reply: '১০০ টাকা।' },
      usage: { inputTokens: 4, cachedInputTokens: 0, outputTokens: 3 },
    };
    const driver = new FakeLlmDriver([result]);

    await expect(driver.respond({ ...request, signal: AbortSignal.abort() })).rejects.toMatchObject(
      {
        code: 'LLM_ABORTED',
      },
    );
    await expect(driver.respond(request)).resolves.toEqual(result);
  });
});
