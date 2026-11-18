import { LlmError, type LlmDriver, type LlmRequest, type LlmResult } from './llm-driver';

export class FakeLlmDriver implements LlmDriver {
  private readonly responses: (LlmResult | Error)[];

  constructor(responses: readonly (LlmResult | Error)[]) {
    this.responses = [...responses];
  }

  async respond(request: LlmRequest): Promise<LlmResult> {
    if (request.signal?.aborted) throw new LlmError('LLM_ABORTED');
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new LlmError('LLM_SCRIPT_EXHAUSTED');
    return response;
  }
}
