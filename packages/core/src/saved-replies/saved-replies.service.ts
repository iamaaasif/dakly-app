import { Inject, Injectable } from '@nestjs/common';

import type {
  CreateSavedReplyInput,
  SavedReply,
  SavedReplyListQuery,
  UpdateSavedReplyInput,
} from '@dakly/contracts/saved-replies';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { savedReplyError } from './saved-replies.errors';
import { SavedRepliesRepository } from './saved-replies.repository';

@Injectable()
export class SavedRepliesService {
  constructor(
    @Inject(SavedRepliesRepository) private readonly repository: SavedRepliesRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: SavedReplyListQuery) {
    await this.requireChats(storeId);
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map(toSavedReply);
    const last = items.at(-1);
    return { items, nextCursor: last && rows.length > query.limit ? last.id : null };
  }

  create(storeId: string, userId: string, input: CreateSavedReplyInput) {
    return this.transaction.runLocked(storeId, async () => {
      await this.requireChats(storeId);
      const reply = await this.repository.create(storeId, userId, input, this.clock.now());
      if (!reply) throw savedReplyError('SAVED_REPLY_SHORTCUT_TAKEN');
      return toSavedReply(reply);
    });
  }

  update(storeId: string, id: string, input: UpdateSavedReplyInput) {
    return this.transaction.runLocked(storeId, async () => {
      await this.requireChats(storeId);
      const reply = await this.repository.update(storeId, id, input, this.clock.now());
      if (reply === 'shortcut_taken') throw savedReplyError('SAVED_REPLY_SHORTCUT_TAKEN');
      if (!reply) throw savedReplyError('SAVED_REPLY_NOT_FOUND');
      return toSavedReply(reply);
    });
  }

  remove(storeId: string, id: string) {
    return this.transaction.runLocked(storeId, async () => {
      await this.requireChats(storeId);
      if (!(await this.repository.remove(storeId, id)))
        throw savedReplyError('SAVED_REPLY_NOT_FOUND');
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
