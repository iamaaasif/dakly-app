import {
  LlmError,
  type LlmDriver,
  type LlmEmbedding,
  type LlmEmbeddingRequest,
  type LlmRequest,
  type LlmResult,
  type LlmTranscription,
  type LlmTranscriptionRequest,
} from './llm-driver';

export class FakeLlmDriver implements LlmDriver {
  private readonly responses: (LlmResult | Error)[];

  private readonly embeddings?: (LlmEmbedding | Error)[];

  private readonly transcriptions: (LlmTranscription | Error)[];

  constructor(
    responses: readonly (LlmResult | Error)[],
    embeddings?: readonly (LlmEmbedding | Error)[],
    transcriptions: readonly (LlmTranscription | Error)[] = [],
  ) {
    this.transcriptions = [...transcriptions];
    this.embeddings = embeddings && [...embeddings];
    this.responses = [...responses];
  }

  async embed(request: LlmEmbeddingRequest): Promise<LlmEmbedding> {
    if (request.signal?.aborted) throw new LlmError('LLM_ABORTED');
    if (!this.embeddings)
      return {
        model: request.model,
        embeddings: request.input.map(() => Array.from({ length: 512 }, () => 0.5)),
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      };
    const embedding = this.embeddings.shift();
    if (embedding instanceof Error) throw embedding;
    if (!embedding) throw new Error('No scripted embedding left');
    return embedding;
  }

  async transcribe(request: LlmTranscriptionRequest): Promise<LlmTranscription> {
    if (request.signal?.aborted) throw new LlmError('LLM_ABORTED');
    const transcription = this.transcriptions.shift();
    if (transcription instanceof Error) throw transcription;
    if (!transcription) throw new Error('No scripted transcription left');
    return transcription;
  }

  async respond(request: LlmRequest): Promise<LlmResult> {
    if (request.signal?.aborted) throw new LlmError('LLM_ABORTED');
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error('No scripted response left');
    return response;
  }
}
