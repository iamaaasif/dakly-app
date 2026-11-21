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

  // The kept contact takes the staff facts typed on the merged one and the stricter clear time.
  // Returns the facts it added so an undo can take back exactly those.
  async adoptStaffFacts(
    storeId: string,
    { keptContactId, mergedContactId }: { keptContactId: string; mergedContactId: string },
  ): Promise<ContactMemoryFact[]> {
    return this.database.forStore(storeId, async (tx) => {
      const rows = await tx
        .select()
        .from(contactMemories)
        .where(
          and(
            eq(contactMemories.storeId, storeId),
            inArray(contactMemories.contactId, [keptContactId, mergedContactId]),
          ),
        );
      const kept = rows.find((row) => row.contactId === keptContactId);
      const merged = rows.find((row) => row.contactId === mergedContactId);
      const keptFacts = factsSchema.parse(kept?.facts ?? []);
      const adopted = z
        .array(contactMemoryFactSchema)
        .parse(merged?.facts ?? [])
        .filter(
          (fact) =>
            fact.source === 'staff' &&
            !keptFacts.some(({ kind, value }) => kind === fact.kind && value === fact.value),
        )
        .slice(0, 40 - keptFacts.length);
      const clearedAt = strictestCutoff(kept?.clearedAt, merged?.clearedAt);
      if (!adopted.length && !clearedAt) return [];
      await tx
        .insert(contactMemories)
        .values({ storeId, contactId: keptContactId })
        .onConflictDoNothing();
      await tx
        .update(contactMemories)
        .set({ facts: [...keptFacts, ...adopted], clearedAt })
        .where(
          and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, keptContactId)),
        );
      return adopted;
    });
  }

  async removeAdoptedFacts(
    storeId: string,
    contactId: string,
    adopted: ContactMemoryFact[],
  ): Promise<void> {
    if (!adopted.length) return;
    await this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ facts: contactMemories.facts })
        .from(contactMemories)
        .where(and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, contactId)))
        .for('update');
      if (!row) return;
      const taken = new Set(adopted.map((fact) => JSON.stringify(fact)));
      const facts = z
        .array(contactMemoryFactSchema)
        .parse(row.facts)
        .filter((fact) => !taken.has(JSON.stringify(fact)));
      await tx
        .update(contactMemories)
        .set({ facts })
        .where(and(eq(contactMemories.storeId, storeId), eq(contactMemories.contactId, contactId)));
    });
  }
}

// The later clear time wins, so nothing a customer asked to forget comes back after a merge.
function strictestCutoff(...dates: (Date | null | undefined)[]): Date | null {
  return (
    dates
      .filter((date) => date != null)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
}
