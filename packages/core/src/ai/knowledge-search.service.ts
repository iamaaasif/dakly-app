import { Inject, Injectable } from '@nestjs/common';

import { AiService } from './ai.service';
import { KnowledgeRepository, type KnowledgeHit } from './knowledge/knowledge.repository';

@Injectable()
export class KnowledgeSearchService {
  constructor(
    @Inject(KnowledgeRepository) private readonly repository: KnowledgeRepository,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  async search(storeId: string, query: string, limit: number): Promise<KnowledgeHit[]> {
    const {
      embeddings: [embedding],
      model,
    } = await this.ai.embed(storeId, [query]);
    if (!embedding) throw new Error('Embedding result is missing a vector');
    return this.repository.search(storeId, { query, embedding, model, limit });
  }
}
