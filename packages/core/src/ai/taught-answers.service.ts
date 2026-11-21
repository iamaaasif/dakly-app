import { Inject, Injectable } from '@nestjs/common';

import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';

import { KnowledgeService } from './knowledge/knowledge.service';

type TaughtAnswer = { question: string; answer: string; keywords?: string[] };

// What other features may do to the AI's knowledge: teach one answer.
@Injectable()
export class TaughtAnswersService {
  constructor(@Inject(KnowledgeService) private readonly knowledge: KnowledgeService) {}

  teach(
    storeId: string,
    actor: { kind: 'user'; userId: string },
    answer: TaughtAnswer,
  ): Promise<KnowledgeItemResponse> {
    return this.knowledge.create(storeId, actor, { kind: 'policy', ...answer });
  }
}
