import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CreateSavedReplyInput,
  SavedReply,
  SavedReplyListQuery,
  UpdateSavedReplyInput,
} from '@dakly/contracts/saved-replies';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { savedReplyError } from './saved-replies.errors';
import { SavedRepliesRepository } from './saved-replies.repository';

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

@Injectable()
export class SavedRepliesService {
  constructor(
    @Inject(SavedRepliesRepository) private readonly repository: SavedRepliesRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(storeId: string, query: SavedReplyListQuery) {
    await this.requireChats(storeId);
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map(toSavedReply);
    const last = items.at(-1);
    return { items, nextCursor: last && rows.length > query.limit ? last.id : null };
  }

  create(storeId: string, actor: Actor, input: CreateSavedReplyInput) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      const reply = await this.repository.create(storeId, actor.userId, input, this.clock.now());
      if (!reply) throw savedReplyError('SAVED_REPLY_SHORTCUT_TAKEN');
      await this.recordChange(storeId, actor, reply.id, {
        action: 'created',
        fields: Object.keys(input),
      });
      return toSavedReply(reply);
    });
  }

  update(storeId: string, id: string, actor: Actor, input: UpdateSavedReplyInput) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      const reply = await this.repository.update(storeId, id, input, this.clock.now());
      if (reply === 'shortcut_taken') throw savedReplyError('SAVED_REPLY_SHORTCUT_TAKEN');
      if (!reply) throw savedReplyError('SAVED_REPLY_NOT_FOUND');
      await this.recordChange(storeId, actor, id, {
        action: 'updated',
        fields: Object.keys(input),
      });
      return toSavedReply(reply);
    });
  }

  remove(storeId: string, id: string, actor: Actor) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      if (!(await this.repository.remove(storeId, id)))
        throw savedReplyError('SAVED_REPLY_NOT_FOUND');
      await this.recordChange(storeId, actor, id, { action: 'deleted' });
    });
  }

  private recordChange(
    storeId: string,
    actor: Actor,
    id: string,
    change: { action: 'created' | 'updated' | 'deleted'; fields?: string[] },
  ) {
    return this.audit.record(storeId, {
      actor,
      action: `saved_reply.${change.action}`,
      entityType: 'saved_reply',
      entityId: id,
      ...(change.fields && { after: { changedFields: change.fields } }),
    });
  }

  private async requireChats(storeId: string) {
    const { extensions } = await this.stores.settings(storeId);
    if (!extensions.includes('chats')) throw savedReplyError('SAVED_REPLIES_DISABLED');
  }
}

type SavedReplyRow = Awaited<ReturnType<SavedRepliesRepository['list']>>[number];

function toSavedReply({ createdAt, updatedAt, ...reply }: SavedReplyRow): SavedReply {
  return { ...reply, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}
