import { Inject, Injectable } from '@nestjs/common';

import type {
  ChangeKnowledgeItemInput,
  CreateKnowledgeItemInput,
  KnowledgeItemListResponse,
  KnowledgeItemResponse,
  ListKnowledgeItemsQuery,
} from '@dakly/contracts/knowledge';

import { Clock } from '../../platform/clock';
import { StoreTransaction } from '../../platform/database/store-transaction';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { knowledgeError } from './knowledge.errors';
import { KnowledgeRepository, type KnowledgeItem } from './knowledge.repository';

type UserActor = { kind: 'user'; userId: string };
const knowledgeFileTypes = new Set(['application/pdf', 'text/plain']);

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(KnowledgeRepository) private readonly repository: KnowledgeRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  create(
    storeId: string,
    actor: UserActor,
    input: CreateKnowledgeItemInput,
  ): Promise<KnowledgeItemResponse> {
    return this.transaction.run(storeId, async () => {
      if (input.kind === 'file') await this.requireFile(storeId, input.fileId);
      const now = this.clock.now();
      const item = await this.repository.create(storeId, actor.userId, input, now);
      await this.requestIndex(storeId, item.id, now);
      return toResponse(item);
    });
  }

  async list(storeId: string, query: ListKnowledgeItemsQuery): Promise<KnowledgeItemListResponse> {
    const rows = await this.repository.list(storeId, query);
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toResponse),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async view(storeId: string, itemId: string): Promise<KnowledgeItemResponse> {
    const item = await this.repository.find(storeId, itemId);
    if (!item) throw knowledgeError('KNOWLEDGE_ITEM_NOT_FOUND');
    return toResponse(item);
  }

  change(
    storeId: string,
    itemId: string,
    input: ChangeKnowledgeItemInput,
    _actor: UserActor,
  ): Promise<KnowledgeItemResponse> {
    return this.transaction.run(storeId, async () => {
      if ('fileId' in input) await this.requireFile(storeId, input.fileId);
      const now = this.clock.now();
      const item = await this.repository.change(storeId, itemId, input, now);
      if (!item) throw knowledgeError('KNOWLEDGE_ITEM_NOT_FOUND');
      await this.requestIndex(storeId, item.id, now);
      return toResponse(item);
    });
  }

  async remove(storeId: string, itemId: string, _actor: UserActor): Promise<void> {
    if (!(await this.repository.remove(storeId, itemId))) {
      throw knowledgeError('KNOWLEDGE_ITEM_NOT_FOUND');
    }
  }

  private async requireFile(storeId: string, fileId: string): Promise<void> {
    const file = await this.repository.findFile(storeId, fileId);
    if (!file || file.status !== 'ready') throw knowledgeError('KNOWLEDGE_FILE_NOT_FOUND');
    if (!knowledgeFileTypes.has(file.contentType))
      throw knowledgeError('KNOWLEDGE_FILE_TYPE_INVALID');
  }

  private requestIndex(storeId: string, itemId: string, now: Date): Promise<void> {
    return this.outbox.publish({
      type: 'knowledge.index_requested',
      storeId,
      occurredAt: now.toISOString(),
      payload: { knowledgeItemId: itemId },
    });
  }
}

function toResponse(item: KnowledgeItem): KnowledgeItemResponse {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
