import {
  LlmError,
  type LlmDriver,
  type LlmEmbedding,
  type LlmEmbeddingRequest,
  type LlmRequest,
  type LlmResult,
} from './llm-driver';

export class FakeLlmDriver implements LlmDriver {
  private readonly responses: (LlmResult | Error)[];

  private readonly embeddings: (LlmEmbedding | Error)[];

  constructor(
    responses: readonly (LlmResult | Error)[],
    embeddings: readonly (LlmEmbedding | Error)[] = [],
  ) {
    this.embeddings = [...embeddings];
    this.responses = [...responses];
  }

  async embed(request: LlmEmbeddingRequest): Promise<LlmEmbedding> {
    if (request.signal?.aborted) throw new LlmError('LLM_ABORTED');
    const embedding = this.embeddings.shift();
    if (embedding instanceof Error) throw embedding;
    if (!embedding) throw new Error('No scripted embedding left');
    return embedding;
  }

  async respond(request: LlmRequest): Promise<LlmResult> {
    if (request.signal?.aborted) throw new LlmError('LLM_ABORTED');
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error('No scripted response left');
    return response;
  }
}
