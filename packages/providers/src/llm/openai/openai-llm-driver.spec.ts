import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { LlmRequest } from '../llm-driver';
import { OpenAiLlmDriver } from './openai-llm-driver';
import fixtures from './openai-response.fixtures.json';

const request: LlmRequest = {
  model: 'test-model',
  instructions: 'Reply in the customer’s language.',
  input: 'দাম কত?',
  output: z.object({ reply: z.string() }),
  timeoutMs: 1000,
};

describe('OpenAiLlmDriver', () => {
  it('returns all 512-dimension embeddings in input order and the measured tokens', async () => {
    const input = ['দাম কত?', 'Returns within seven days'];
    const embeddings = [
      Array.from({ length: 512 }, (_, index) => index / 512),
      Array.from({ length: 512 }, (_, index) => (index + 1) / 512),
    ];
    const driver = new OpenAiLlmDriver('test-key', async (url, options) => {
      expect(url).toBe('https://api.openai.com/v1/embeddings');
      expect(JSON.parse(String(options?.body))).toEqual({
        model: 'text-embedding-3-small',
        input,
        dimensions: 512,
        encoding_format: 'float',
      });
      return Response.json({
        object: 'list',
        model: 'text-embedding-3-small',
        data: [
          { index: 1, object: 'embedding', embedding: embeddings[1] },
          { index: 0, object: 'embedding', embedding: embeddings[0] },
        ],
        usage: { prompt_tokens: 10, total_tokens: 10 },
      });
    });
    await expect(
      driver.embed({ ...request, input, model: 'text-embedding-3-small' }),
    ).resolves.toEqual({
      model: 'text-embedding-3-small',
      embeddings,
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 0 },
    });
  });

  it.each([
    [{ index: 0, embedding: [0.1, 0.2] }],
    [{ index: 'invalid', embedding: [0.1, 0.2] }],
    [{ index: 0, embedding: ['invalid'] }],
  ])('rejects malformed vectors while preserving measured input tokens', async (data) => {
    const driver = new OpenAiLlmDriver('test-key', async () =>
      Response.json({
        model: 'text-embedding-3-small',
        data,
        usage: { prompt_tokens: 4 },
      }),
    );
    await expect(driver.embed({ ...request, input: [request.input] })).rejects.toMatchObject({
      code: 'LLM_INVALID_RESPONSE',
      usage: { inputTokens: 4 },
    });
  });

  it('requests strict structured output without storing the response', async () => {
    const fetchResponse: typeof fetch = async (url, options) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(options).toMatchObject({
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: 'Bearer test-key' },
      });
      expect(JSON.parse(String(options?.body))).toMatchObject({
        model: 'test-model',
        instructions: request.instructions,
        input: request.input,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            strict: true,
            schema: {
              type: 'object',
              properties: { reply: { type: 'string' } },
              required: ['reply'],
              additionalProperties: false,
            },
          },
        },
      });
      return Response.json(fixtures.reply);
    };

    const driver = new OpenAiLlmDriver('test-key', fetchResponse);
    await expect(driver.respond(request)).resolves.toEqual({
      kind: 'output',
      model: 'test-model-2026-11-01',
      responseId: 'resp_fixture',
      output: { reply: '১০০ টাকা।' },
      usage: { inputTokens: 1200, cachedInputTokens: 1024, outputTokens: 15 },
    });
  });

  it('gives the caller the model’s tool calls and usage', async () => {
    const driver = new OpenAiLlmDriver('test-key', async (_url, options) => {
      expect(JSON.parse(String(options?.body))).toMatchObject({
        store: false,
        tools: [
          {
            type: 'function',
            name: 'find_product',
            description: 'Find a product by name.',
            strict: true,
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
              additionalProperties: false,
            },
          },
        ],
      });
      return Response.json(fixtures.toolCalls);
    });
    const tools = [
      {
        name: 'find_product',
        description: 'Find a product by name.',
        input: z.object({ query: z.string() }),
      },
    ];

    await expect(driver.respond({ ...request, tools })).resolves.toEqual({
      kind: 'tool_calls',
      model: 'test-model-2026-11-01',
      responseId: 'resp_fixture',
      toolCalls: [{ id: 'call_fixture', name: 'find_product', argumentsJson: '{"query":"কুর্তি"}' }],
      usage: { inputTokens: 230, cachedInputTokens: 0, outputTokens: 23 },
    });
  });

  it.each([
    ['LLM_REFUSED', fixtures.refusal],
    ['LLM_INCOMPLETE', fixtures.incomplete],
  ])('returns %s with the tokens already spent', async (code, fixture) => {
    const driver = new OpenAiLlmDriver('test-key', async () => Response.json(fixture));

    await expect(driver.respond(request)).rejects.toMatchObject({
      code,
      usage: { inputTokens: 32, cachedInputTokens: 0, outputTokens: 8 },
    });
  });

  it.each([
    [429, 'LLM_RATE_LIMITED'],
    [500, 'LLM_UNAVAILABLE'],
    [400, 'LLM_REQUEST_FAILED'],
  ])('returns a safe error from HTTP %s', async (status, code) => {
    const driver = new OpenAiLlmDriver('test-key', async () =>
      Response.json({ error: { message: 'Private prompt text' } }, { status }),
    );

    await expect(driver.respond(request)).rejects.toMatchObject({ code, message: code });
  });

  it('refuses optional fields in a nested strict schema before sending', async () => {
    const driver = new OpenAiLlmDriver('test-key', async () => Response.json(fixtures.reply));
    const output = z.object({ details: z.object({ summary: z.string().optional() }) });

    await expect(driver.respond({ ...request, output })).rejects.toMatchObject({
      code: 'LLM_INVALID_SCHEMA',
    });
  });

  it.each([
    z.object({ reply: z.string().optional().default('খালি') }),
    z.object({ amount: z.intersection(z.number().min(0), z.number().max(10)) }),
  ])('refuses a schema with unsupported fields or composition', async (output) => {
    const driver = new OpenAiLlmDriver('test-key', async () => Response.json(fixtures.reply));

    await expect(driver.respond({ ...request, output })).rejects.toMatchObject({
      code: 'LLM_INVALID_SCHEMA',
    });
  });

  it('converts a nested discriminated union to supported anyOf branches', async () => {
    const output = z.object({
      reply: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('text'), text: z.string() }),
        z.object({ kind: z.literal('handover'), reason: z.string() }),
      ]),
    });
    const driver = new OpenAiLlmDriver('test-key', async (_url, options) => {
      expect(JSON.parse(String(options?.body)).text.format.schema.properties.reply).toMatchObject({
        anyOf: [
          { properties: { kind: { const: 'text' } }, additionalProperties: false },
          { properties: { kind: { const: 'handover' } }, additionalProperties: false },
        ],
      });
      return Response.json(fixtures.reply);
    });

    await expect(driver.respond({ ...request, output })).resolves.toMatchObject({ kind: 'output' });
  });

  it('cancels a rejected HTTP response body without reading it', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const driver = new OpenAiLlmDriver('test-key', async () => new Response(body, { status: 429 }));

    await expect(driver.respond(request)).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED' });
    expect(cancelled).toBe(true);
  });

  it('accepts nullable fields in a strict schema', async () => {
    const driver = new OpenAiLlmDriver('test-key', async (_url, options) => {
      expect(JSON.parse(String(options?.body))).toMatchObject({
        text: { format: { strict: true, schema: { required: ['reply'] } } },
      });
      return Response.json(fixtures.reply);
    });
    const output = z.object({ reply: z.string().nullable() });

    await expect(driver.respond({ ...request, output })).resolves.toMatchObject({
      kind: 'output',
    });
  });

  it('rejects a body that does not match the Responses API', async () => {
    const driver = new OpenAiLlmDriver('test-key', async () => Response.json({ result: 'bad' }));

    await expect(driver.respond(request)).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
  });

  it('ends an in-flight request at its deadline', async () => {
    const driver = new OpenAiLlmDriver('test-key', pendingResponse);

    await expect(driver.respond({ ...request, timeoutMs: 10 })).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
    });
  });

  it('ends an in-flight request on caller cancellation', async () => {
    const driver = new OpenAiLlmDriver('test-key', pendingResponse);
    const controller = new AbortController();
    const response = driver.respond({ ...request, signal: controller.signal });
    controller.abort(new Error('Private cancellation reason'));

    await expect(response).rejects.toMatchObject({ code: 'LLM_ABORTED', message: 'LLM_ABORTED' });
  });
});

const pendingResponse: typeof fetch = async (_url, options) =>
  new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
      once: true,
    });
  });
