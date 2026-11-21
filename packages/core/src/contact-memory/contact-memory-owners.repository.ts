import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { contactMemoryFactSchema, type ContactMemoryFact } from '@dakly/contracts/contact-memory';
import { conversations } from '@dakly/db/schema/chats';
import { contactMemories } from '@dakly/db/schema/contact-memory';

import { TenantDatabase } from '../platform/database/tenant-database';

const factsSchema = z.array(contactMemoryFactSchema);

// What a merge or its undo does to customer memory. Every method joins the caller's transaction.
@Injectable()
export class ContactMemoryOwnersRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // A merge or its undo changes who owns the chats. Derived summaries and facts go at once, every
  // checkpoint resets so the sweep rebuilds from each contact's own chats and orders, and every
  // version moves so a model call already running fails its guard. Staff facts stay with the
  // contact that holds them. Runs in the caller's transaction, after ownership has changed.
  async invalidateForOwners(storeId: string, contactIds: string[], now: Date): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      await tx
        .insert(contactMemories)
        .values(contactIds.map((contactId) => ({ storeId, contactId })))
        .onConflictDoNothing();
      await tx
        .update(contactMemories)
        .set({
          facts: sql`coalesce((select jsonb_agg(fact) from jsonb_array_elements(${contactMemories.facts}) fact where fact->>'source' = 'staff'), '[]'::jsonb)`,
          summary: sql`case when ${contactMemories.editedAt} is null then '' else ${contactMemories.summary} end`,
          builtAt: null,
          version: sql`${contactMemories.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(eq(contactMemories.storeId, storeId), inArray(contactMemories.contactId, contactIds)),
        );
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
    });
  }

  // Locks the memory rows of both contacts for the rest of the transaction. A contact with no
  // row yet has no facts and no clear time.
  async lockMemories(storeId: string, contactIds: string[]) {
    return this.database.forStore(storeId, async (tx) => {
      const rows = await tx
        .select({
          contactId: contactMemories.contactId,
          facts: contactMemories.facts,
          clearedAt: contactMemories.clearedAt,
        })
        .from(contactMemories)
        .where(
          and(eq(contactMemories.storeId, storeId), inArray(contactMemories.contactId, contactIds)),
        )
        .orderBy(contactMemories.contactId)
        .for('update');
      return rows.map((row) => ({ ...row, facts: factsSchema.parse(row.facts) }));
    });
  }

  async saveFacts(
    storeId: string,
    contactId: string,
    change: { facts: ContactMemoryFact[]; clearedAt?: Date | null },
  ): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      await tx.insert(contactMemories).values({ storeId, contactId }).onConflictDoNothing();
      await tx
        .update(contactMemories)
        .set(change)
        .where(and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, contactId)));
    });
  }
}
