import { Inject, Injectable } from '@nestjs/common';

import { AiService } from './ai.service';
import { KnowledgeRepository, type KnowledgeHit } from './knowledge/knowledge.repository';

@Injectable()
export class KnowledgeSearchService {
  constructor(
    @Inject(KnowledgeRepository) private readonly repository: KnowledgeRepository,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  hasActiveItem(storeId: string) {
    return this.repository.hasActive(storeId);
  }

  recordUse(storeId: string, itemIds: string[]) {
    return this.repository.recordUse(storeId, itemIds);
  }

  async describe(storeId: string, itemId: string) {
    const item = await this.repository.find(storeId, itemId);
    return item && { kind: item.kind, question: item.question, fileName: item.fileName };
  }

  async search(storeId: string, query: string, limit: number): Promise<KnowledgeHit[]> {
    const {
      embeddings: [embedding],
      model,
    } = await this.ai.embed(storeId, [query]);
    if (!embedding) throw new Error('Embedding result is missing a vector');
    return this.repository.search(storeId, { query, embedding, model, limit });
  }
}
