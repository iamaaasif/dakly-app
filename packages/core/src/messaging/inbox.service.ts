import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ConversationAssigneeResponse,
  ConversationCountsResponse,
  ConversationListQuery,
  ConversationSummaryResponse,
  ConversationMessageListQuery,
  ConversationMessageResponse,
  ConversationResponse,
  CreateConversationNoteInput,
  TakeOverConversationInput,
  UpdateConversationInput,
  handoverReasons,
} from '@dakly/contracts/chats';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { UsersService } from '../auth/users.service';
import { ContactsService } from '../contacts/contacts.service';
import { ChatOrdersService } from '../orders/chat-orders.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS, MINUTE_MS, startOfDayIn } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { InboxRepository } from './inbox.repository';
import { messagingError } from './messaging.errors';

type ConversationRow = NonNullable<Awaited<ReturnType<InboxRepository['find']>>>;
type MessageRow = Awaited<ReturnType<InboxRepository['messages']>>[number];
type UserActor = Extract<AuditEntry['actor'], { kind: 'user' }>;

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
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(ChatOrdersService) private readonly chatOrders: ChatOrdersService,
  ) {}

  async list(storeId: string, query: ConversationListQuery, access: StoreAccess, actor: UserActor) {
    await this.requireChats(storeId);
    const contactIds = query.q
      ? await this.contacts.searchIds(storeId, query.q, access, actor)
      : undefined;
    if (contactIds && !contactIds.length) return { items: [], nextCursor: null };
    const rows = await this.repository.list(storeId, query, contactIds);
    const page = rows.slice(0, query.limit);
    const items = page.map(({ sortGroup: _group, ...row }) => conversationResponse(row));
    const last = page.at(-1);
    if (!last || rows.length <= query.limit) return { items, nextCursor: null };
    const position = `${last.lastMessageAt ?? 'none'}_${last.id}`;
    return {
      items,
      nextCursor: query.sort === 'recent' ? position : `${last.sortGroup}_${position}`,
    };
  }

  async assignees(storeId: string): Promise<ConversationAssigneeResponse[]> {
    await this.requireChats(storeId);
    const userIds = await this.team.userIdsWithPermission(storeId, 'chats.view');
    const profiles = await this.users.profiles(userIds);
    return profiles
      .map((profile) => ({ userId: profile.id, name: profile.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async counts(storeId: string): Promise<ConversationCountsResponse> {
    await this.requireChats(storeId);
    return this.repository.counts(storeId);
  }

  async summary(storeId: string, access: StoreAccess): Promise<ConversationSummaryResponse> {
    await this.requireChats(storeId);
    const since = startOfDayIn(await this.stores.timeZone(storeId), this.clock.now());
    return {
      aiRepliesToday: await this.repository.aiRepliesSince(storeId, since),
      chatOrdersToday: access.areas.orders
        ? await this.chatOrders.totalsSince(storeId, since)
        : null,
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
    const items = rows.slice(0, query.limit).map(messageResponse);
    const last = items.at(-1);
    return {
      items,
      nextCursor: last && rows.length > query.limit ? `${last.createdAt}_${last.id}` : null,
    };
  }

  addNote(storeId: string, id: string, actor: UserActor, input: CreateConversationNoteInput) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      await this.find(storeId, id, 'no key update');
      const note = await this.repository.addNote(
        storeId,
        id,
        { ...input, authorUserId: actor.userId },
        this.clock.now(),
      );
      return messageResponse(note);
    });
  }

  async markRead(storeId: string, id: string): Promise<ConversationResponse> {
    await this.requireChats(storeId);
    await this.find(storeId, id);
    const row = await this.repository.markRead(storeId, id);
    if (!row) throw messagingError('CONVERSATION_NOT_FOUND');
    return conversationResponse(row);
  }

  update(storeId: string, id: string, userId: string, input: UpdateConversationInput) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      const before = await this.find(storeId, id, 'no key update');
      if (input.assigneeUserId && !(await this.team.accessFor(storeId, input.assigneeUserId)))
        throw messagingError('CONVERSATION_ASSIGNEE_INVALID');
      const status = input.status ?? before.status;
      const assigneeUserId =
        input.assigneeUserId === undefined ? before.assigneeUserId : input.assigneeUserId;
      if (status === before.status && assigneeUserId === before.assigneeUserId)
        return conversationResponse(before);
      const after = await this.repository.update(storeId, id, input, { now: this.clock.now() });
      if (!after) throw messagingError('CONVERSATION_NOT_FOUND');
      await this.recordChange(storeId, { kind: 'user', userId }, before, after);
      return conversationResponse(after);
    });
  }

  setResponder(
    storeId: string,
    id: string,
    actor: UserActor,
    change: ({ responder: 'human' } & TakeOverConversationInput) | { responder: 'ai' },
  ) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      const before = await this.find(storeId, id, 'no key update');
      const now = this.clock.now();
      const { responder } = change;
      const aiResumesAt =
        responder === 'human' && change.returnAfterMinutes
          ? new Date(now.getTime() + change.returnAfterMinutes * MINUTE_MS)
          : null;
      if (before.responder === responder && before.aiResumesAt === null && aiResumesAt === null)
        return conversationResponse(before);
      const after = await this.repository.update(
        storeId,
        id,
        { responder, aiResumesAt, handoverReason: null, handedOverAt: null },
        { now },
      );
      if (!after) throw messagingError('CONVERSATION_NOT_FOUND');
      await this.recordChange(storeId, actor, before, after);
      return conversationResponse(after);
    });
  }

  async returnDue(storeId: string, id: string, actor: { kind: 'system' }) {
    // A return and a change to the Chats extension must take effect in order.
    await this.transaction.runLocked(storeId, async () => {
      const before = await this.repository.find(storeId, id, 'no key update');
      const now = this.clock.now();
      if (!before?.aiResumesAt || before.aiResumesAt > now) return;
      const { extensions } = await this.stores.settings(storeId);
      if (!extensions.includes('chats')) return;
      const canReturn =
        before.responder === 'human' &&
        (await this.contacts.findRecipient(storeId, before.contactId));
      const after = await this.repository.update(
        storeId,
        id,
        canReturn
          ? { responder: 'ai', aiResumesAt: null, handoverReason: null, handedOverAt: null }
          : { aiResumesAt: null },
        { now, bumpVersion: false },
      );
      if (after) await this.recordChange(storeId, actor, before, after);
    });
  }

  async aiReplyTurn(storeId: string, id: string, lock = false) {
    const turn = await this.repository.aiReplyTurn(storeId, id, lock);
    return turn?.windowExpiresAt && turn.windowExpiresAt > this.clock.now() ? turn : undefined;
  }

  // The earliest AI reply to this contact in the last 24 hours, on any channel.
  firstAiReplyInDay(storeId: string, contactId: string) {
    return this.repository.firstAiReplySince(
      storeId,
      contactId,
      new Date(this.clock.now().getTime() - DAY_MS),
    );
  }

  // A hand-over nobody claims returns to the AI after returnAfterMinutes; null keeps it with people.
  async handOver(
    storeId: string,
    id: string,
    reason: (typeof handoverReasons)[number],
    returnAfterMinutes: number | null,
  ) {
    return this.transaction.run(storeId, async () => {
      const before = await this.repository.find(storeId, id, 'no key update');
      if (before?.responder !== 'ai') return undefined;
      const now = this.clock.now();
      const aiResumesAt =
        returnAfterMinutes === null
          ? null
          : new Date(now.getTime() + returnAfterMinutes * MINUTE_MS);
      const after = await this.repository.update(
        storeId,
        id,
        {
          status: 'needs_you',
          responder: 'human',
          handoverReason: reason,
          handedOverAt: now,
          aiResumesAt,
        },
        { now },
      );
      if (after) await this.recordChange(storeId, { kind: 'system' }, before, after);
      return after;
    });
  }

  // A staff reply puts the chat with people and restarts the return timer, unless staff took over
  // until they hand back, or a longer take-over timer is already running.
  async restartReturnAfterStaffReply(storeId: string, messageId: string, minutes: number) {
    await this.transaction.run(storeId, async () => {
      const reply = await this.repository.findStaffReply(storeId, messageId);
      if (!reply) return;
      const before = await this.repository.find(storeId, reply.conversationId, 'no key update');
      if (!before || before.responder === 'paused') return;
      const untilHandBack =
        before.responder === 'human' && !before.aiResumesAt && !before.handoverReason;
      if (untilHandBack) return;
      // Count from when the person replied, so a late job does not push the return back.
      const restart = new Date(reply.createdAt.getTime() + minutes * MINUTE_MS);
      const aiResumesAt =
        before.aiResumesAt && before.aiResumesAt > restart ? before.aiResumesAt : restart;
      const after = await this.repository.update(
        storeId,
        before.id,
        { responder: 'human', aiResumesAt, handoverReason: null, handedOverAt: null },
        { now: this.clock.now() },
      );
      if (after) await this.recordChange(storeId, { kind: 'system' }, before, after);
    });
  }

  private async find(storeId: string, id: string, lock?: 'no key update') {
    const row = await this.repository.find(storeId, id, lock);
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
    actor: AuditEntry['actor'],
    before: ConversationRow,
    after: ConversationRow,
  ) {
    await this.audit.record(storeId, {
      actor,
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

function messageResponse(row: MessageRow): ConversationMessageResponse {
  return { ...row, sentAt: row.sentAt?.toISOString() ?? null };
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
