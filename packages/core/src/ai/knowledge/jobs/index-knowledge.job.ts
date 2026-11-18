import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { knowledgeIndexRequestedEventSchema } from '@dakly/contracts/events/knowledge';

import { HandlesEvent } from '../../../platform/outbox/handles-event';
import type { JobHandler } from '../../../platform/queue/job-handler';
import { QUEUES } from '../../../platform/queue/queues';
import { KnowledgeIndexService } from '../knowledge-index.service';

@HandlesEvent('knowledge.index_requested', { queue: QUEUES.bulk, retryBackoffMs: 60_000 })
export class IndexKnowledgeJob implements JobHandler {
  constructor(@Inject(KnowledgeIndexService) private readonly indexer: KnowledgeIndexService) {}

  async handle(data: unknown, finalAttempt: boolean): Promise<void> {
    const { storeId, occurredAt, payload } = knowledgeIndexRequestedEventSchema
      .extend({ id: z.uuid() })
      .parse(data);
    await this.indexer.index(storeId, payload.knowledgeItemId, {
      revision: occurredAt,
      finalAttempt,
    });
  }
}
