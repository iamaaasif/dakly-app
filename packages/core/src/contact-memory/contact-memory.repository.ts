import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import { contactMemorySchema, type ContactMemory } from '@dakly/contracts/contact-memory';
import type { Database } from '@dakly/db/client';
import { conversations, messages } from '@dakly/db/schema/chats';
import { contactMemories } from '@dakly/db/schema/contact-memory';
import { contacts } from '@dakly/db/schema/contacts';
import { orderItems, orders } from '@dakly/db/schema/orders';

import { DATABASE } from '../platform/database/database.tokens';
import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

export const memoryMessageLimit = 60;
const orderLimit = 10;
const itemsPerOrderLimit = 5;

export type Checkpoint = { messageId: string; at: Date };

export type MemoryWork = {
  contactId: string;
  contactVersion: number;
  conversationVersion: number;
  checkpoint: Checkpoint | null;
  // Last customer message of this batch. Messages that arrive during the model call wait.
  through: Checkpoint;
  memory: ContactMemory;
  summaryEditedByStaff: boolean;
  messages: { id: string; at: Date; text: string }[];
  orders: { id: string; at: Date; deliveryArea: string | null; items: string[] }[];
};

export type MemorySave = {
  work: MemoryWork;
  conversationSummary: string | null;
  memory: ContactMemory | null;
  builtAt: Date;
};

@Injectable()
export class ContactMemoryRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly globalDatabase: Database,
  ) {}

  async dueConversations(asOf: Date) {
    const result = await this.globalDatabase.execute<{ storeId: string; conversationId: string }>(
      sql`select store_id as "storeId", conversation_id as "conversationId" from due_conversation_memories(${asOf}, 100)`,
    );
    return result.rows;
  }

  // Reads one consistent view of the evidence. Nothing here holds a lock into the model call.
  load(storeId: string, conversationId: string): Promise<MemoryWork | undefined> {
    return this.database.forStore(storeId, async (tx) => {
      const conversation = await readConversation(tx, storeId, conversationId);
      if (!conversation) return undefined;
      const [stored] = await tx
        .select()
        .from(contactMemories)
        .where(
          and(
            eq(contactMemories.storeId, storeId),
            eq(contactMemories.contactId, conversation.contactId),
          ),
        );
      const { checkpoint } = conversation;
      const clearedAt = stored?.clearedAt ?? null;
      const batch = await readNewMessages(tx, { storeId, conversationId, checkpoint, clearedAt });
      const last = batch.at(-1);
      if (!last) return undefined;
      const since = latest(checkpoint?.at, clearedAt);
      return {
        contactId: conversation.contactId,
        contactVersion: stored?.version ?? 0,
        conversationVersion: conversation.version,
        checkpoint,
        through: { messageId: last.id, at: last.at },
        memory: storedMemory(stored),
        summaryEditedByStaff: Boolean(stored?.editedAt),
        messages: batch.map(({ id, at, body, mediaText }) => ({
          id,
          at,
          text: [body, mediaText].filter(Boolean).join('\n'),
        })),
        orders: await readOwnOrders(tx, storeId, conversation.contactId, since),
      };
    });
  }

  // The guards decide whether this batch is still current. A stale batch writes nothing, so a
  // staff edit, a clear or a merge that happened during the model call always wins.
  save(storeId: string, conversationId: string, save: MemorySave): Promise<boolean> {
    const { work } = save;
    return this.database.forStore(storeId, async (tx) => {
      if (!(await lockCurrent(tx, storeId, conversationId, work))) return false;
      if (save.memory)
        await tx
          .update(contactMemories)
          .set({
            summary: save.memory.summary,
            facts: save.memory.facts,
            builtAt: save.builtAt,
            version: sql`${contactMemories.version} + 1`,
            updatedAt: save.builtAt,
          })
          .where(
            and(
              eq(contactMemories.storeId, storeId),
              eq(contactMemories.contactId, work.contactId),
            ),
          );
      await tx
        .update(conversations)
        .set({
          ...(save.conversationSummary === null ? {} : { aiSummary: save.conversationSummary }),
          memoryBuiltThroughMessageId: work.through.messageId,
          memoryBuiltThroughMessageAt: work.through.at,
          memoryVersion: sql`${conversations.memoryVersion} + 1`,
        })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId)));
      return true;
    });
  }

  // Clearing bumps every version so a model call already in flight fails its guard, and moves every
  // checkpoint to the latest message so a rebuild cannot read the cleared history again.
  clear(storeId: string, contactId: string, userId: string, now: Date): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      const [contact] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.storeId, storeId),
            eq(contacts.id, contactId),
            isNull(contacts.deletedAt),
          ),
        )
        .for('update');
      if (!contact) return false;
      await tx.insert(contactMemories).values({ storeId, contactId }).onConflictDoNothing();
      await tx
        .update(contactMemories)
        .set({
          summary: '',
          facts: [],
          clearedAt: now,
          editedByUserId: userId,
          editedAt: now,
          version: sql`${contactMemories.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, contactId)));
      await tx.execute(sql`
        update conversations c
        set memory_built_through_message_id = latest.id,
            memory_built_through_message_at = latest.created_at
        from (
          select distinct on (m.conversation_id) m.conversation_id, m.id, m.created_at
          from messages m
          where m.store_id = ${storeId} and m.direction = 'in' and m.author_type = 'customer'
            and m.conversation_id in (
              select id from conversations where store_id = ${storeId} and contact_id = ${contactId}
            )
          order by m.conversation_id, m.created_at desc, m.id desc
        ) latest
        where c.store_id = ${storeId} and c.id = latest.conversation_id
      `);
      await tx
        .update(conversations)
        .set({ memoryVersion: sql`${conversations.memoryVersion} + 1` })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.contactId, contactId)));
      return true;
    });
  }
}

async function readConversation(tx: Transaction, storeId: string, conversationId: string) {
  const [row] = await tx
    .select({
      contactId: conversations.contactId,
      version: conversations.memoryVersion,
      checkpointId: conversations.memoryBuiltThroughMessageId,
      checkpointAt: conversations.memoryBuiltThroughMessageAt,
    })
    .from(conversations)
    .innerJoin(
      contacts,
      and(eq(contacts.storeId, conversations.storeId), eq(contacts.id, conversations.contactId)),
    )
    .where(
      and(
        eq(conversations.storeId, storeId),
        eq(conversations.id, conversationId),
        isNull(contacts.deletedAt),
      ),
    );
  if (!row) return undefined;
  const checkpoint: Checkpoint | null =
    row.checkpointId && row.checkpointAt
      ? { messageId: row.checkpointId, at: row.checkpointAt }
      : null;
  return { contactId: row.contactId, version: row.version, checkpoint };
}

// Customer messages after this conversation's own checkpoint and the clear time, oldest first.
function readNewMessages(
  tx: Transaction,
  {
    storeId,
    conversationId,
    checkpoint,
    clearedAt,
  }: {
    storeId: string;
    conversationId: string;
    checkpoint: Checkpoint | null;
    clearedAt: Date | null;
  },
) {
  return tx
    .select({
      id: messages.id,
      at: messages.createdAt,
      body: messages.body,
      mediaText: messages.mediaText,
    })
    .from(messages)
    .where(
      and(
        eq(messages.storeId, storeId),
        eq(messages.conversationId, conversationId),
        eq(messages.direction, 'in'),
        eq(messages.authorType, 'customer'),
        sql`${messages.kind} <> 'note'`,
        checkpoint
          ? sql`(${messages.createdAt}, ${messages.id}) > (${checkpoint.at}, ${checkpoint.messageId})`
          : undefined,
        clearedAt ? gt(messages.createdAt, clearedAt) : undefined,
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(memoryMessageLimit);
}

// Orders the customer placed as buyer. A delivery area counts only when they are the recipient.
async function readOwnOrders(
  tx: Transaction,
  storeId: string,
  contactId: string,
  since: Date | undefined,
) {
  const recent = await tx
    .select({
      id: orders.id,
      at: orders.createdAt,
      deliveryArea: sql<
        string | null
      >`case when ${orders.isRecipientBuyer} then ${orders.recipientDistrict} end`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.buyerContactId, contactId),
        since ? gt(orders.createdAt, since) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(orderLimit);
  if (!recent.length) return [];
  const items = await tx
    .select({
      orderId: orderItems.orderId,
      name: orderItems.productName,
      variant: orderItems.variantTitle,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.storeId, storeId),
        inArray(
          orderItems.orderId,
          recent.map((order) => order.id),
        ),
      ),
    );
  return recent.map((order) => ({
    ...order,
    items: items
      .filter((item) => item.orderId === order.id)
      .slice(0, itemsPerOrderLimit)
      .map((item) => `${item.name} ${item.variant}`),
  }));
}

// Locks the conversation and the memory row and checks that nothing changed since the read.
async function lockCurrent(
  tx: Transaction,
  storeId: string,
  conversationId: string,
  work: MemoryWork,
): Promise<boolean> {
  const [conversation] = await tx
    .select({
      contactId: conversations.contactId,
      version: conversations.memoryVersion,
      checkpointId: conversations.memoryBuiltThroughMessageId,
    })
    .from(conversations)
    .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId)))
    .for('update');
  if (
    conversation?.contactId !== work.contactId ||
    conversation.version !== work.conversationVersion ||
    conversation.checkpointId !== (work.checkpoint?.messageId ?? null)
  )
    return false;
  await tx
    .insert(contactMemories)
    .values({ storeId, contactId: work.contactId })
    .onConflictDoNothing();
  const [current] = await tx
    .select({ version: contactMemories.version })
    .from(contactMemories)
    .where(and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, work.contactId)))
    .for('update');
  return current?.version === work.contactVersion;
}

function latest(...dates: (Date | null | undefined)[]): Date | undefined {
  return dates
    .filter((date) => date != null)
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

function storedMemory(row: { summary: string; facts: unknown } | undefined): ContactMemory {
  return contactMemorySchema.parse(
    row ? { summary: row.summary, facts: row.facts } : { summary: '', facts: [] },
  );
}
