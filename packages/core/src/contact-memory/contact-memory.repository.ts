import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';

import type { ContactMemoryFact } from '@dakly/contracts/contact-memory';
import type { Database } from '@dakly/db/client';
import { conversations, messages } from '@dakly/db/schema/chats';
import { contactMemories } from '@dakly/db/schema/contact-memory';
import { contacts } from '@dakly/db/schema/contacts';
import { orders } from '@dakly/db/schema/orders';

import { DATABASE } from '../platform/database/database.tokens';
import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

export type MessageCursor = { id: string; at: Date };

export type PendingMessage = {
  id: string;
  at: Date;
  direction: string;
  authorType: string;
  text: string | null;
};

export type ConversationMemoryState = {
  contactId: string;
  contactDeleted: boolean;
  conversationVersion: number;
  checkpoint: MessageCursor | null;
  conversationSummary: string | null;
  latest: MessageCursor | null;
  // Null until the contact has a memory row.
  memory: {
    version: number;
    summary: string;
    facts: unknown;
    clearedAt: Date | null;
    summaryEditedByStaff: boolean;
  } | null;
};

export type ConversationUpdate = {
  contactId: string;
  conversationId: string;
  expectedConversationVersion: number;
  expectedCheckpoint: MessageCursor | null;
  next: MessageCursor;
  conversationSummary: string | null;
  // Absent when the run found nothing durable: only the checkpoint and summary move.
  memory?: {
    expectedVersion: number | null;
    summary: string;
    facts: ContactMemoryFact[];
    builtAt: Date;
  };
};

class StaleMemoryWrite extends Error {}

const cursorAfter = (cursor: MessageCursor) =>
  sql`(${messages.createdAt}, ${messages.id}) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)`;
const cursorUpTo = (cursor: MessageCursor) =>
  sql`(${messages.createdAt}, ${messages.id}) <= (${cursor.at}::timestamptz, ${cursor.id}::uuid)`;

@Injectable()
export class ContactMemoryRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly globalDatabase: Database,
  ) {}

  async dueConversations(asOf: Date) {
    const result = await this.globalDatabase.execute<{ storeId: string; conversationId: string }>(
      sql`select store_id as "storeId", conversation_id as "conversationId" from due_conversation_memory_updates(${asOf}, 100)`,
    );
    return result.rows;
  }

  readState(storeId: string, conversationId: string): Promise<ConversationMemoryState | null> {
    return this.database.forStore(storeId, async (tx) => {
      const [conversation] = await tx
        .select({
          contactId: conversations.contactId,
          version: conversations.memoryVersion,
          checkpointId: conversations.memoryBuiltThroughMessageId,
          checkpointAt: conversations.memoryBuiltThroughMessageAt,
          summary: conversations.aiSummary,
          contactDeletedAt: contacts.deletedAt,
        })
        .from(conversations)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, conversations.storeId),
            eq(contacts.id, conversations.contactId),
          ),
        )
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId)));
      if (!conversation) return null;
      const [latest] = await tx
        .select({ id: messages.id, at: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.storeId, storeId), eq(messages.conversationId, conversationId)))
        .orderBy(sql`${messages.createdAt} desc, ${messages.id} desc`)
        .limit(1);
      const [memory] = await tx
        .select()
        .from(contactMemories)
        .where(
          and(
            eq(contactMemories.storeId, storeId),
            eq(contactMemories.contactId, conversation.contactId),
          ),
        );
      return {
        contactId: conversation.contactId,
        contactDeleted: conversation.contactDeletedAt !== null,
        conversationVersion: conversation.version,
        checkpoint:
          conversation.checkpointId && conversation.checkpointAt
            ? { id: conversation.checkpointId, at: conversation.checkpointAt }
            : null,
        conversationSummary: conversation.summary,
        latest: latest ?? null,
        memory: memory
          ? {
              version: memory.version,
              summary: memory.summary,
              facts: memory.facts,
              clearedAt: memory.clearedAt,
              summaryEditedByStaff: memory.editedAt !== null,
            }
          : null,
      };
    });
  }

  // A message inserted after the checkpoint (a later uuid v7) that sorts before it was missed.
  hasLateInsert(storeId: string, conversationId: string, checkpoint: MessageCursor) {
    return this.database.forStore(storeId, async (tx) => {
      const [late] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.conversationId, conversationId),
            gt(messages.id, checkpoint.id),
            cursorUpTo(checkpoint),
          ),
        )
        .limit(1);
      return late !== undefined;
    });
  }

  // The reading window is fixed by the caller's latest message, so a message that arrives during
  // the model call is left for the next run.
  pendingMessages(
    storeId: string,
    conversationId: string,
    window: { after: MessageCursor | null; clearedAt: Date | null; through: MessageCursor },
    limit: number,
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: messages.id,
          at: messages.createdAt,
          direction: messages.direction,
          authorType: messages.authorType,
          text: sql<string | null>`coalesce(${messages.body}, ${messages.mediaText})`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.conversationId, conversationId),
            ne(messages.kind, 'note'),
            window.after ? cursorAfter(window.after) : undefined,
            window.clearedAt ? gt(messages.createdAt, window.clearedAt) : undefined,
            cursorUpTo(window.through),
          ),
        )
        .orderBy(asc(messages.createdAt), asc(messages.id))
        .limit(limit),
    );
  }

  // Only orders the customer placed for themselves count; a gift's recipient is someone else.
  selfDeliveryOrders(storeId: string, contactId: string, after: Date | null) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: orders.id,
          district: orders.recipientDistrict,
          at: orders.createdAt,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.buyerContactId, contactId),
            eq(orders.isRecipientBuyer, true),
            ne(orders.stage, 'cancelled'),
            after ? gt(orders.createdAt, after) : undefined,
          ),
        )
        .orderBy(asc(orders.createdAt))
        .limit(20),
    );
  }

  async conversationIdsOf(storeId: string, contactId: string) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.storeId, storeId), eq(conversations.contactId, contactId))),
    );
    return rows.map(({ id }) => id);
  }

  // Returns false when a guard failed; nothing is written then, and the caller reads again.
  async saveConversationUpdate(storeId: string, update: ConversationUpdate): Promise<boolean> {
    try {
      await this.database.forStore(storeId, async (tx) => {
        const checkpoint = update.expectedCheckpoint;
        const moved = await tx
          .update(conversations)
          .set({
            memoryBuiltThroughMessageId: update.next.id,
            memoryBuiltThroughMessageAt: update.next.at,
            memoryVersion: sql`${conversations.memoryVersion} + 1`,
            aiSummary: update.conversationSummary,
          })
          .where(
            and(
              eq(conversations.storeId, storeId),
              eq(conversations.id, update.conversationId),
              eq(conversations.contactId, update.contactId),
              eq(conversations.memoryVersion, update.expectedConversationVersion),
              checkpoint
                ? and(
                    eq(conversations.memoryBuiltThroughMessageId, checkpoint.id),
                    eq(conversations.memoryBuiltThroughMessageAt, checkpoint.at),
                  )
                : isNull(conversations.memoryBuiltThroughMessageId),
              sql`exists (select 1 from ${contacts} where ${contacts.storeId} = ${storeId} and ${contacts.id} = ${update.contactId} and ${contacts.deletedAt} is null)`,
            ),
          )
          .returning({ id: conversations.id });
        if (moved.length === 0) throw new StaleMemoryWrite();
        if (
          update.memory &&
          !(await this.writeMemory(tx, storeId, update.contactId, update.memory))
        )
          throw new StaleMemoryWrite();
      });
      return true;
    } catch (error) {
      if (error instanceof StaleMemoryWrite) return false;
      throw error;
    }
  }

  private async writeMemory(
    tx: Transaction,
    storeId: string,
    contactId: string,
    memory: NonNullable<ConversationUpdate['memory']>,
  ): Promise<boolean> {
    const values = { summary: memory.summary, facts: memory.facts, builtAt: memory.builtAt };
    const written =
      memory.expectedVersion === null
        ? await tx
            .insert(contactMemories)
            .values({ storeId, contactId, ...values, version: 1 })
            .onConflictDoNothing()
            .returning({ contactId: contactMemories.contactId })
        : await tx
            .update(contactMemories)
            .set({ ...values, version: sql`${contactMemories.version} + 1` })
            .where(
              and(
                eq(contactMemories.storeId, storeId),
                eq(contactMemories.contactId, contactId),
                eq(contactMemories.version, memory.expectedVersion),
              ),
            )
            .returning({ contactId: contactMemories.contactId });
    return written.length > 0;
  }

  // Staff replace the memory; the version moves so a model result read earlier cannot land.
  saveStaffMemory(
    storeId: string,
    contactId: string,
    edit: { summary: string; facts: ContactMemoryFact[]; userId: string; at: Date },
  ) {
    return this.database.forStore(storeId, async (tx) => {
      const values = {
        summary: edit.summary,
        facts: edit.facts,
        editedByUserId: edit.userId,
        editedAt: edit.at,
      };
      await tx
        .insert(contactMemories)
        .values({ storeId, contactId, ...values, version: 1 })
        .onConflictDoUpdate({
          target: contactMemories.contactId,
          set: { ...values, version: sql`${contactMemories.version} + 1` },
        });
    });
  }

  readMemory(storeId: string, contactId: string) {
    return this.database.forStore(storeId, async (tx) => {
      const [memory] = await tx
        .select()
        .from(contactMemories)
        .where(and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, contactId)));
      return memory;
    });
  }

  // One transaction: empty the memory, set the cutoff, and move every conversation's checkpoint to
  // its latest message so a model result already in flight fails its guard and nothing is replayed.
  clear(storeId: string, contactId: string, at: Date, userId: string | null) {
    return this.database.forStore(storeId, async (tx) => {
      await tx
        .insert(contactMemories)
        .values({ storeId, contactId, clearedAt: at, version: 1, editedByUserId: userId })
        .onConflictDoUpdate({
          target: contactMemories.contactId,
          set: {
            summary: '',
            facts: [],
            clearedAt: at,
            editedByUserId: userId,
            editedAt: null,
            version: sql`${contactMemories.version} + 1`,
          },
        });
      await tx.execute(sql`
        update ${conversations} c
        set memory_version = c.memory_version + 1,
            memory_built_through_message_id = latest.id,
            memory_built_through_message_at = latest.created_at
        from (
          select c2.id as conversation_id,
            (select m.id from ${messages} m where m.store_id = c2.store_id and m.conversation_id = c2.id order by m.created_at desc, m.id desc limit 1) as id,
            (select m.created_at from ${messages} m where m.store_id = c2.store_id and m.conversation_id = c2.id order by m.created_at desc, m.id desc limit 1) as created_at
          from ${conversations} c2
          where c2.store_id = ${storeId} and c2.contact_id = ${contactId}
        ) latest
        where c.id = latest.conversation_id and c.store_id = ${storeId}
      `);
    });
  }

  // For a merge or undo: drop what the model derived, keep staff-authored facts and the strictest
  // clear cutoff, and send every conversation back to the start so a rebuild reads its own chats.
  async invalidateDerived(storeId: string, contactIds: string[]): Promise<string[]> {
    if (contactIds.length === 0) return [];
    return this.database.forStore(storeId, async (tx) => {
      const rows = await tx
        .select()
        .from(contactMemories)
        .where(
          and(eq(contactMemories.storeId, storeId), inArray(contactMemories.contactId, contactIds)),
        );
      const cutoffs = rows.flatMap(({ clearedAt }) => (clearedAt ? [clearedAt.getTime()] : []));
      const strictest = cutoffs.length ? new Date(Math.max(...cutoffs)) : null;
      for (const contactId of contactIds) {
        const row = rows.find((candidate) => candidate.contactId === contactId);
        const facts = Array.isArray(row?.facts)
          ? (row.facts as ContactMemoryFact[]).filter((fact) => fact.source === 'staff')
          : [];
        const values = {
          summary: row?.editedAt ? row.summary : '',
          facts,
          clearedAt: strictest,
        };
        await tx
          .insert(contactMemories)
          .values({ storeId, contactId, ...values, version: 1 })
          .onConflictDoUpdate({
            target: contactMemories.contactId,
            set: { ...values, version: sql`${contactMemories.version} + 1` },
          });
      }
      await tx
        .update(conversations)
        .set({
          memoryBuiltThroughMessageId: null,
          memoryBuiltThroughMessageAt: null,
          memoryVersion: sql`${conversations.memoryVersion} + 1`,
        })
        .where(
          and(eq(conversations.storeId, storeId), inArray(conversations.contactId, contactIds)),
        );
      return contactIds;
    });
  }

  // A checkpoint that a late insert proved wrong is dropped; the next run reads from the cutoff.
  resetCheckpoint(storeId: string, conversationId: string, expectedVersion: number) {
    return this.database
      .forStore(storeId, (tx) =>
        tx
          .update(conversations)
          .set({
            memoryBuiltThroughMessageId: null,
            memoryBuiltThroughMessageAt: null,
            memoryVersion: sql`${conversations.memoryVersion} + 1`,
          })
          .where(
            and(
              eq(conversations.storeId, storeId),
              eq(conversations.id, conversationId),
              eq(conversations.memoryVersion, expectedVersion),
            ),
          )
          .returning({ id: conversations.id }),
      )
      .then((rows) => rows.length > 0);
  }
}
