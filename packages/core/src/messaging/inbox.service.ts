import { Inject, Injectable } from '@nestjs/common';

import type {
  ConversationListQuery,
  ConversationMessageListQuery,
  ConversationMessageResponse,
  ConversationResponse,
  UpdateConversationInput,
} from '@dakly/contracts/chats';

import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { InboxRepository } from './inbox.repository';
import { messagingError } from './messaging.errors';

type ConversationRow = NonNullable<Awaited<ReturnType<InboxRepository['find']>>>;

@Injectable()
export class InboxService {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: ConversationListQuery) {
    await this.requireChats(storeId);
    const visible: ConversationRow[] = [];
    let cursor = query.cursor;
    while (visible.length <= query.limit) {
      const rows = await this.repository.list(storeId, { ...query, cursor });
      const last = rows.at(-1);
      if (!last) break;
      const active = await this.contacts.findRecipients(
        storeId,
        rows.map((row) => row.contactId),
      );
      const activeIds = new Set(active.map((contact) => contact.id));
      visible.push(...rows.filter((row) => activeIds.has(row.contactId)));
      if (rows.length <= query.limit) break;
      cursor = conversationCursor(last);
    }
    const page = visible.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(conversationResponse),
      nextCursor: last && visible.length > query.limit ? conversationCursor(last) : null,
    };
  }

  async get(storeId: string, id: string): Promise<ConversationResponse> {
    await this.requireChats(storeId);
    return conversationResponse(await this.find(storeId, id));
  }

  async messages(storeId: string, id: string, query: ConversationMessageListQuery) {
    await this.requireChats(storeId);
    await this.find(storeId, id);
    const rows = await this.repository.messages(storeId, id, query);
    const items: ConversationMessageResponse[] = rows.slice(0, query.limit).map((row) => ({
      ...row,
      sentAt: row.sentAt?.toISOString() ?? null,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor: last && rows.length > query.limit ? `${last.createdAt}_${last.id}` : null,
    };
  }

  update(storeId: string, id: string, userId: string, input: UpdateConversationInput) {
    return this.transaction.runLocked(storeId, async () => {
      await this.requireChats(storeId);
      const before = await this.find(storeId, id);
      if (input.assigneeUserId && !(await this.team.accessFor(storeId, input.assigneeUserId)))
        throw messagingError('CONVERSATION_ASSIGNEE_INVALID');
      const status = input.status ?? before.status;
      const assigneeUserId =
        input.assigneeUserId === undefined ? before.assigneeUserId : input.assigneeUserId;
      if (status === before.status && assigneeUserId === before.assigneeUserId)
        return conversationResponse(before);
      const after = await this.repository.update(
        storeId,
        id,
        { status, assigneeUserId },
        this.clock.now(),
      );
      if (!after) throw messagingError('CONVERSATION_NOT_FOUND');
      await this.recordChange(storeId, userId, before, after);
      return conversationResponse(after);
    });
  }

  setResponder(storeId: string, id: string, userId: string, responder: 'human' | 'ai') {
    return this.transaction.runLocked(storeId, async () => {
      await this.requireChats(storeId);
      const before = await this.find(storeId, id);
      if (before.responder === responder && before.aiResumesAt === null)
        return conversationResponse(before);
      const after = await this.repository.update(
        storeId,
        id,
        { responder, aiResumesAt: null, handoverReason: null, handedOverAt: null },
        this.clock.now(),
      );
      if (!after) throw messagingError('CONVERSATION_NOT_FOUND');
      await this.recordChange(storeId, userId, before, after);
      return conversationResponse(after);
    });
  }

  private async find(storeId: string, id: string) {
    const row = await this.repository.find(storeId, id);
    if (!row || !(await this.contacts.findRecipient(storeId, row.contactId)))
      throw messagingError('CONVERSATION_NOT_FOUND');
    return row;
  }

  private async requireChats(storeId: string) {
    const { extensions } = await this.stores.settings(storeId);
    if (!extensions.includes('chats')) throw messagingError('CHATS_DISABLED');
  }

  private async recordChange(
    storeId: string,
    userId: string,
    before: ConversationRow,
    after: ConversationRow,
  ) {
    await this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action: 'conversation.updated',
      entityType: 'conversation',
      entityId: after.id,
      after: {
        changedFields: (
          [
            'status',
            'responder',
            'assigneeUserId',
            'aiResumesAt',
            'handoverReason',
            'handedOverAt',
          ] as const
        ).filter((field) => {
          const previous = before[field];
          const current = after[field];
          return previous instanceof Date && current instanceof Date
            ? previous.getTime() !== current.getTime()
            : previous !== current;
        }),
      },
    });
  }
}

function conversationCursor({ lastMessageAt, id }: ConversationRow): `${string}_${string}` {
  return `${lastMessageAt ?? 'none'}_${id}`;
}

function conversationResponse({
  aiResumesAt,
  handedOverAt,
  windowExpiresAt,
  ...row
}: ConversationRow): ConversationResponse {
  return {
    ...row,
    aiResumesAt: aiResumesAt?.toISOString() ?? null,
    handedOverAt: handedOverAt?.toISOString() ?? null,
    windowExpiresAt: windowExpiresAt?.toISOString() ?? null,
  };
}
