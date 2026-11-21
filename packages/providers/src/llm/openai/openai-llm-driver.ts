import { z } from 'zod';

import {
  LlmError,
  type LlmDriver,
  type LlmEmbedding,
  type LlmEmbeddingRequest,
  type LlmRequest,
  type LlmResult,
} from '../llm-driver';

const unsupportedSchemaKeywords = [
  'allOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'dependentRequired',
  'dependentSchemas',
];

const responseUsage = z
  .object({
    input_tokens: z.int().nonnegative(),
    input_tokens_details: z.object({ cached_tokens: z.int().nonnegative() }).optional(),
    output_tokens: z.int().nonnegative(),
  })
  .refine(({ input_tokens, input_tokens_details }) => {
    return (input_tokens_details?.cached_tokens ?? 0) <= input_tokens;
  });

const responseEnvelope = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(['completed', 'failed', 'incomplete', 'cancelled', 'queued', 'in_progress']),
  output: z.array(z.looseObject({ type: z.string() })),
  usage: responseUsage.nullish(),
});

const functionCall = z.object({
  call_id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.string(),
});

const message = z.object({
  role: z.literal('assistant'),
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('output_text'), text: z.string() }),
      z.object({ type: z.literal('refusal') }),
    ]),
  ),
});

const embeddingEnvelope = z.object({
  model: z.string().min(1),
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
      index: z.int().nonnegative(),
    }),
  ),
});
const embeddingUsage = z.object({ usage: z.object({ prompt_tokens: z.int().nonnegative() }) });

export class OpenAiLlmDriver implements LlmDriver {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async respond(request: LlmRequest): Promise<LlmResult> {
    return decodeResponse(await this.post('responses', responseRequestBody(request), request));
  }

  async embed(request: LlmEmbeddingRequest): Promise<LlmEmbedding> {
    const body = await this.post(
      'embeddings',
      JSON.stringify({
        model: request.model,
        input: request.input,
        dimensions: 512,
        encoding_format: 'float',
      }),
      request,
    );
    const reported = embeddingUsage.safeParse(body);
    if (!reported.success) throw new LlmError('LLM_INVALID_RESPONSE');
    const usage = {
      inputTokens: reported.data.usage.prompt_tokens,
      cachedInputTokens: 0,
      outputTokens: 0,
    };
    const result = embeddingEnvelope.safeParse(body);
    if (!result.success) throw new LlmError('LLM_INVALID_RESPONSE', usage);
    const rows = result.data.data.sort((a, b) => a.index - b.index);
    if (
      rows.length !== request.input.length ||
      rows.some((row, index) => row.index !== index || row.embedding.length !== 512)
    )
      throw new LlmError('LLM_INVALID_RESPONSE', usage);
    return { model: result.data.model, embeddings: rows.map(({ embedding }) => embedding), usage };
  }

  private async post(
    path: 'responses' | 'embeddings',
    body: string,
    request: Pick<LlmRequest, 'timeoutMs' | 'signal'>,
  ): Promise<unknown> {
    const deadline = AbortSignal.timeout(request.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, deadline]) : deadline;
    try {
      const response = await this.request(`https://api.openai.com/v1/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body,
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw httpError(response.status);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      throw responseError(error, signal, deadline);
    }
  }
}

function responseRequestBody(request: LlmRequest): string {
  try {
    return JSON.stringify({
      model: request.model,
      instructions: request.instructions,
      input: request.attachments?.length ? attachedInput(request) : request.input,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'dakly_output',
          strict: true,
          schema: strictSchema(request.output),
        },
      },
      tools: request.tools?.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        strict: true,
        parameters: strictSchema(tool.input),
      })),
    });
  } catch {
    throw new LlmError('LLM_INVALID_SCHEMA');
  }
}

function attachedInput(request: LlmRequest) {
  const content = (request.attachments ?? []).map((file) => {
    const data = `data:${file.contentType};base64,${Buffer.from(file.bytes).toString('base64')}`;
    return file.contentType === 'application/pdf'
      ? { type: 'input_file', filename: 'page.pdf', file_data: data }
      : { type: 'input_image', image_url: data };
  });
  return [{ role: 'user', content: [{ type: 'input_text', text: request.input }, ...content] }];
}

function responseError(error: unknown, signal: AbortSignal, deadline: AbortSignal): LlmError {
  if (signal.aborted) {
    const timedOut = deadline.aborted && signal.reason === deadline.reason;
    return new LlmError(timedOut ? 'LLM_TIMEOUT' : 'LLM_ABORTED');
  }
  if (error instanceof LlmError) return error;
  if (error instanceof SyntaxError) return new LlmError('LLM_INVALID_RESPONSE');
  return new LlmError('LLM_REQUEST_FAILED');
}

function httpError(status: number): LlmError {
  if (status === 429) return new LlmError('LLM_RATE_LIMITED');
  if (status >= 500) return new LlmError('LLM_UNAVAILABLE');
  return new LlmError('LLM_REQUEST_FAILED');
}

function strictSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
    override: ({ zodSchema, jsonSchema }) => {
      const definition = zodSchema._zod.def;
      if ('discriminator' in definition && jsonSchema.oneOf) {
        jsonSchema.anyOf = jsonSchema.oneOf;
        delete jsonSchema.oneOf;
      }
      if (unsupportedSchemaKeywords.some((keyword) => Object.hasOwn(jsonSchema, keyword)))
        throw new LlmError('LLM_INVALID_SCHEMA');
      if (jsonSchema.type !== 'object') return;
      jsonSchema.additionalProperties ??= false;
      const required = jsonSchema.required ?? [];
      const fields = Object.keys(jsonSchema.properties ?? {});
      if (
        jsonSchema.additionalProperties !== false ||
        fields.some((field) => !required.includes(field))
      ) {
        throw new LlmError('LLM_INVALID_SCHEMA');
      }
    },
  });
  if (generated.type !== 'object') throw new LlmError('LLM_INVALID_SCHEMA');
  return generated;
}

function decodeResponse(payload: unknown): LlmResult {
  const envelope = responseEnvelope.safeParse(payload);
  if (!envelope.success) throw new LlmError('LLM_INVALID_RESPONSE');
  const { id: responseId, model, status, output, usage: vendorUsage } = envelope.data;
  const usage = vendorUsage
    ? {
        inputTokens: vendorUsage.input_tokens,
        cachedInputTokens: vendorUsage.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: vendorUsage.output_tokens,
      }
    : undefined;
  if (status === 'failed') throw new LlmError('LLM_REQUEST_FAILED', usage);
  if (status !== 'completed') throw new LlmError('LLM_INCOMPLETE', usage);
  if (!usage) throw new LlmError('LLM_INVALID_RESPONSE');

  const metadata = { usage, model, responseId };
  const calls = output.filter((item) => item.type === 'function_call');
  if (calls.length) {
    const parsed = z.array(functionCall).safeParse(calls);
    if (!parsed.success) throw new LlmError('LLM_INVALID_RESPONSE', usage);
    const toolCalls = parsed.data.map((call) => ({
      id: call.call_id,
      name: call.name,
      argumentsJson: call.arguments,
    }));
    return { ...metadata, kind: 'tool_calls', toolCalls };
  }

  return { ...metadata, kind: 'output', output: decodeMessage(output, usage) };
}

function decodeMessage(
  output: z.infer<typeof responseEnvelope>['output'],
  usage: LlmResult['usage'],
): unknown {
  const messages = z.array(message).safeParse(output.filter((item) => item.type === 'message'));
  if (!messages.success) throw new LlmError('LLM_INVALID_RESPONSE', usage);
  const content = messages.data.flatMap((item) => item.content);
  let text = '';
  for (const part of content) {
    if (part.type === 'refusal') throw new LlmError('LLM_REFUSED', usage);
    text += part.text;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError('LLM_INVALID_RESPONSE', usage);
  }
}
