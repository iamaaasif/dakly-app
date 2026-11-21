import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type { ConsentChannel, ConsentStatus } from '@dakly/contracts/contacts';
import { conversations } from '@dakly/db/schema/chats';
import {
  consents,
  contactMatchSuggestions,
  contactMerges,
  contacts,
} from '@dakly/db/schema/contacts';
import { dueEntries } from '@dakly/db/schema/due-book';

import { TenantDatabase } from '../platform/database/tenant-database';
import type { ContactFields } from './contact-merge-fields';

// Every table that points at a contact and must follow it. Names are fixed here, never input.
const movedRelations = [
  { key: 'identities', table: 'contact_identities', column: 'contact_id' },
  { key: 'conversations', table: 'conversations', column: 'contact_id' },
  { key: 'orders', table: 'orders', column: 'buyer_contact_id' },
  { key: 'tasks', table: 'tasks', column: 'contact_id' },
  { key: 'comments', table: 'social_comments', column: 'contact_id' },
] as const;

export type MovedRows = Partial<Record<(typeof movedRelations)[number]['key'], string[]>>;
export type StoredContact = ContactFields & { id: string; createdAt: Date; deletedAt: Date | null };
export type ConsentState = { channel: ConsentChannel; status: ConsentStatus; capturedAt: Date };
export type MergeRecord = typeof contactMerges.$inferSelect;

@Injectable()
export class ContactMergeRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  findByOperationKey(storeId: string, operationKey: string) {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select()
        .from(contactMerges)
        .where(
          and(eq(contactMerges.storeId, storeId), eq(contactMerges.operationKey, operationKey)),
        );
      return row;
    });
  }

  // Locks in id order so two merges over the same pair cannot wait on each other.
  lockContacts(storeId: string, ids: string[]): Promise<StoredContact[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.storeId, storeId), inArray(contacts.id, ids)))
        .orderBy(contacts.id)
        .for('update'),
    );
  }

  lockMerge(storeId: string, mergeId: string) {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select()
        .from(contactMerges)
        .where(and(eq(contactMerges.storeId, storeId), eq(contactMerges.id, mergeId)))
        .for('update');
      return row;
    });
  }

  // A merge made later (ids are time-ordered) that still stands and involves either contact depends on this one.
  hasLaterActiveMerge(storeId: string, merge: MergeRecord): Promise<boolean> {
    const ids = [merge.keptContactId, merge.mergedContactId].filter((id) => id !== null);
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ id: contactMerges.id })
        .from(contactMerges)
        .where(
          and(
            eq(contactMerges.storeId, storeId),
            ne(contactMerges.id, merge.id),
            isNull(contactMerges.undoneAt),
            gt(contactMerges.id, merge.id),
            or(
              inArray(contactMerges.keptContactId, ids),
              inArray(contactMerges.mergedContactId, ids),
            ),
          ),
        )
        .limit(1);
      return row !== undefined;
    });
  }

  insertMerge(storeId: string, values: Omit<typeof contactMerges.$inferInsert, 'storeId'>) {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .insert(contactMerges)
        .values({ ...values, storeId })
        .returning();
      if (!row) throw new Error('Merge record was not saved');
      return row;
    });
  }

  markUndone(
    storeId: string,
    mergeId: string,
    undo: { userId: string; at: Date; conflicts: string[] },
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(contactMerges)
        .set({ undoneAt: undo.at, undoneByUserId: undo.userId, undoConflicts: undo.conflicts })
        .where(and(eq(contactMerges.storeId, storeId), eq(contactMerges.id, mergeId))),
    );
  }

  // Two chats on one page cannot belong to one customer (unique per page and customer).
  hasChatOnSamePage(storeId: string, firstId: string, secondId: string): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.storeId, storeId),
            eq(conversations.contactId, firstId),
            sql`exists (
              select 1 from conversations other
              where other.store_id = ${storeId} and other.contact_id = ${secondId}
                and other.channel_connection_id = ${conversations.channelConnectionId}
            )`,
          ),
        )
        .limit(1);
      return row !== undefined;
    });
  }

  // The baki ledger is append-only and cannot change owner, so its customer is never merged away.
  hasDueEntries(storeId: string, contactId: string): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ id: dueEntries.id })
        .from(dueEntries)
        .where(and(eq(dueEntries.storeId, storeId), eq(dueEntries.contactId, contactId)))
        .limit(1);
      return row !== undefined;
    });
  }

  async moveRows(storeId: string, fromId: string, toId: string): Promise<MovedRows> {
    return this.database.forStore(storeId, async (tx) => {
      const moved: MovedRows = {};
      for (const { key, table, column } of movedRelations) {
        const result = await tx.execute<{ id: string }>(sql`
          update ${sql.identifier(table)} set ${sql.identifier(column)} = ${toId}
          where store_id = ${storeId} and ${sql.identifier(column)} = ${fromId}
          returning id`);
        moved[key] = result.rows.map((row) => row.id);
      }
      return moved;
    });
  }

  // Returns `relation:id` for rows that could not go back because their owner changed since the merge.
  async returnRows(
    storeId: string,
    moved: MovedRows,
    { fromId, toId }: { fromId: string; toId: string },
  ): Promise<string[]> {
    return this.database.forStore(storeId, async (tx) => {
      const stayed: string[] = [];
      for (const { key, table, column } of movedRelations) {
        const ids = moved[key] ?? [];
        if (!ids.length) continue;
        const result = await tx.execute<{ id: string }>(sql`
          update ${sql.identifier(table)} set ${sql.identifier(column)} = ${toId}
          where store_id = ${storeId} and ${sql.identifier(column)} = ${fromId}
            and id in (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )})
          returning id`);
        const returned = new Set(result.rows.map((row) => row.id));
        stayed.push(...ids.filter((id) => !returned.has(id)).map((id) => `${key}:${id}`));
      }
      return stayed;
    });
  }

  updateContact(storeId: string, id: string, values: Partial<typeof contacts.$inferInsert>) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(contacts)
        .set(values)
        .where(and(eq(contacts.storeId, storeId), eq(contacts.id, id))),
    );
  }

  phoneOwnerId(storeId: string, phone: string, exceptId: string): Promise<string | undefined> {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.storeId, storeId),
            eq(contacts.phone, phone),
            isNull(contacts.deletedAt),
            ne(contacts.id, exceptId),
          ),
        );
      return row?.id;
    });
  }

  // The latest answer on each channel, newest first within a channel.
  currentConsents(storeId: string, contactId: string): Promise<ConsentState[]> {
    return this.database.forStore(storeId, async (tx) => {
      const rows = await tx
        .select({
          channel: consents.channel,
          status: consents.status,
          capturedAt: consents.capturedAt,
        })
        .from(consents)
        .where(and(eq(consents.storeId, storeId), eq(consents.contactId, contactId)))
        .orderBy(desc(consents.capturedAt), desc(consents.id));
      return rows.filter(
        (row, index) => rows.findIndex(({ channel }) => channel === row.channel) === index,
      );
    });
  }

  appendConsents(
    storeId: string,
    entries: {
      contactId: string;
      channel: ConsentChannel;
      status: ConsentStatus;
      evidence: string;
      userId: string;
      at: Date;
    }[],
  ) {
    if (!entries.length) return Promise.resolve();
    return this.database.forStore(storeId, (tx) =>
      tx.insert(consents).values(
        entries.map((entry) => ({
          storeId,
          contactId: entry.contactId,
          channel: entry.channel,
          status: entry.status,
          source: 'manual' as const,
          evidence: entry.evidence,
          capturedByUserId: entry.userId,
          capturedAt: entry.at,
        })),
      ),
    );
  }

  // A merge settles the open suggestions between the two contacts.
  closeSuggestions(storeId: string, ids: string[], userId: string, at: Date) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(contactMatchSuggestions)
        .set({ status: 'merged', decidedByUserId: userId, decidedAt: at })
        .where(
          and(
            eq(contactMatchSuggestions.storeId, storeId),
            eq(contactMatchSuggestions.status, 'open'),
            inArray(contactMatchSuggestions.contactId, ids),
            inArray(contactMatchSuggestions.matchedContactId, ids),
          ),
        ),
    );
  }
}
