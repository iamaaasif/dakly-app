import { describe, expect, it } from 'vitest';

import type { AiService } from '../ai.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import type { KnowledgeRepository } from './knowledge.repository';

describe('KnowledgeSearchService', () => {
  it('searches the store with an embedding of the same query', async () => {
    const storeId = 'dffb765b-69e5-46fc-8adc-886147a476ec';
    const itemId = '8aa450d6-bf5b-4aef-945b-2777caff81e9';
    const embedding = Array.from({ length: 512 }, () => 0.5);
    const ai = {
      async embed(tenant: string, queries: readonly string[]) {
        if (tenant !== storeId || queries.length !== 1 || queries[0] !== 'ঢাকা')
          throw new Error('Unexpected embedding input');
        return {
          embeddings: [embedding],
          model: 'test-model',
          usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 },
        };
      },
    } as AiService;
    const repository = {
      async search(tenant: string, input: Parameters<KnowledgeRepository['search']>[1]) {
        if (
          tenant !== storeId ||
          input.query !== 'ঢাকা' ||
          input.model !== 'test-model' ||
          input.embedding[0] !== 0.5 ||
          input.limit !== 1
        )
          return [];
        return [{ itemId, content: 'ঢাকায় ডেলিভারি ৬০ টাকা।' }];
      },
    } as KnowledgeRepository;
    const service = new KnowledgeSearchService(repository, ai);
    await expect(service.search(storeId, 'ঢাকা', 1)).resolves.toEqual([
      { itemId, content: 'ঢাকায় ডেলিভারি ৬০ টাকা।' },
    ]);
  });
});
