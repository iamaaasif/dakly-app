import { Inject, Injectable } from '@nestjs/common';
import { LazyModuleLoader, type ModuleRef } from '@nestjs/core';

import type {
  ChangeKnowledgeItemInput,
  CreateKnowledgeItemInput,
  KnowledgeItemListResponse,
  KnowledgeItemResponse,
  KnowledgeUploadInput,
  KnowledgeUploadResponse,
  ListKnowledgeItemsQuery,
} from '@dakly/contracts/knowledge';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../../platform/clock';
import { newId } from '../../platform/database/new-id';
import { StoreTransaction } from '../../platform/database/store-transaction';
import { FILE_STORAGE_DRIVER } from '../../platform/file-storage/file-storage.provider';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { AiModule } from '../ai.module';
import { AiService } from '../ai.service';
import { knowledgeError } from './knowledge.errors';
import { KnowledgeRepository, type KnowledgeHit, type KnowledgeItem } from './knowledge.repository';

type UserActor = { kind: 'user'; userId: string };

@Injectable()
export class KnowledgeService {
  private aiModule?: Promise<ModuleRef>;

  constructor(
    @Inject(KnowledgeRepository) private readonly repository: KnowledgeRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
    @Inject(LazyModuleLoader) private readonly modules: LazyModuleLoader,
  ) {}

  async requestUpload(
    storeId: string,
    actor: UserActor,
    input: KnowledgeUploadInput,
  ): Promise<KnowledgeUploadResponse> {
    const fileId = newId();
    const objectKey = `stores/${storeId}/knowledge/${fileId}`;
    const uploadUrl = this.storage.createUploadUrl(objectKey, 300, input);
    await this.repository.createFile(storeId, {
      ...input,
      id: fileId,
      objectKey,
      uploadedByUserId: actor.userId,
      createdAt: this.clock.now(),
    });
    return { fileId, uploadUrl };
  }

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

  async search(storeId: string, query: string, limit: number): Promise<KnowledgeHit[]> {
    // Item routes can boot on an API process that does not run AI.
    this.aiModule ??= this.modules.load(() => AiModule);
    const ai = (await this.aiModule).get(AiService);
    const {
      embeddings: [embedding],
      model,
    } = await ai.embed(storeId, [query]);
    if (!embedding) throw new Error('Embedding result is missing a vector');
    return this.repository.search(storeId, { query, embedding, model, limit });
  }

  private async requireFile(storeId: string, fileId: string): Promise<void> {
    const file = await this.repository.findFile(storeId, fileId);
    if (!file || file.status === 'rejected') throw knowledgeError('KNOWLEDGE_FILE_NOT_FOUND');
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
    failureReason:
      item.status === 'failed' ? 'Dakly could not index this item. Edit it to retry.' : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
