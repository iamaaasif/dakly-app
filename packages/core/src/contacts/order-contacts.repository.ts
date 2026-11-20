import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';

import { contactMatchSuggestions, contacts } from '@dakly/db/schema/contacts';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderContactsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async saveOrderPhone(storeId: string, contactId: string, phone: string, now: Date) {
    return this.database.forStore(storeId, async (tx) => {
      try {
        // A phone race can roll back this update without rolling back the order.
        const [saved] = await tx.transaction((savepoint) =>
          savepoint
            .update(contacts)
            .set({
              phone,
              phoneVerifiedAt: null,
              // Giving an own phone makes a phone-less chat contact a lead (glossary).
              kind: sql`case when ${contacts.kind} = 'chat_only' then 'lead' else ${contacts.kind} end`,
              updatedAt: now,
            })
            .where(
              and(
                eq(contacts.storeId, storeId),
                eq(contacts.id, contactId),
                isNull(contacts.phone),
                isNull(contacts.deletedAt),
              ),
            )
            .returning({ id: contacts.id }),
        );
        return saved !== undefined;
      } catch (error) {
        if (isConstraintViolation(error, '23505', 'contacts_store_id_phone_key')) return false;
        throw error;
      }
    });
  }

  async suggestOrderPhoneMatch(
    storeId: string,
    match: Pick<
      typeof contactMatchSuggestions.$inferInsert,
      'contactId' | 'matchedContactId' | 'phone' | 'orderId' | 'conversationId' | 'createdAt'
    >,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(contactMatchSuggestions)
        .values({ ...match, storeId, reason: 'same_phone' })
        .onConflictDoNothing({
          target: [
            contactMatchSuggestions.storeId,
            contactMatchSuggestions.contactId,
            contactMatchSuggestions.matchedContactId,
            contactMatchSuggestions.reason,
          ],
          where: sql`${contactMatchSuggestions.status} = 'open'`,
        }),
    );
  }

  findOpenPhoneMatch(storeId: string, contactId: string, phone: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contactMatchSuggestions.id })
        .from(contactMatchSuggestions)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, storeId),
            eq(contacts.id, contactMatchSuggestions.matchedContactId),
          ),
        )
        .where(
          and(
            eq(contactMatchSuggestions.storeId, storeId),
            eq(contactMatchSuggestions.contactId, contactId),
            eq(contacts.phone, phone),
            isNull(contacts.deletedAt),
            eq(contactMatchSuggestions.reason, 'same_phone'),
            eq(contactMatchSuggestions.status, 'open'),
          ),
        )
        .limit(1),
    );
  }

  listOpenSuggestions(storeId: string, contactId: string) {
    const other = sql<string>`case when ${contactMatchSuggestions.contactId} = ${contactId} then ${contactMatchSuggestions.matchedContactId} else ${contactMatchSuggestions.contactId} end`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contactMatchSuggestions.id,
          reason: contactMatchSuggestions.reason,
          createdAt: contactMatchSuggestions.createdAt,
          otherId: contacts.id,
          otherName: contacts.name,
          otherPhone: contacts.phone,
        })
        .from(contactMatchSuggestions)
        .innerJoin(contacts, and(eq(contacts.storeId, storeId), eq(contacts.id, other)))
        .where(
          and(
            eq(contactMatchSuggestions.storeId, storeId),
            or(
              eq(contactMatchSuggestions.contactId, contactId),
              eq(contactMatchSuggestions.matchedContactId, contactId),
            ),
            eq(contactMatchSuggestions.status, 'open'),
            isNull(contacts.deletedAt),
          ),
        )
        .orderBy(desc(contactMatchSuggestions.createdAt), contactMatchSuggestions.id)
        .limit(20),
    );
  }

  async dismissSuggestion(
    storeId: string,
    id: string,
    decision: { userId: string; now: Date },
  ): Promise<boolean> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(contactMatchSuggestions)
        .set({ status: 'dismissed', decidedByUserId: decision.userId, decidedAt: decision.now })
        .where(
          and(
            eq(contactMatchSuggestions.storeId, storeId),
            eq(contactMatchSuggestions.id, id),
            eq(contactMatchSuggestions.status, 'open'),
          ),
        )
        .returning({ id: contactMatchSuggestions.id }),
    );
    return row !== undefined;
  }

  async markOrderLinked(storeId: string, contactId: string, now: Date): Promise<boolean> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(contacts)
        .set({
          updatedAt: sql`greatest(${contacts.updatedAt} + interval '1 millisecond', ${now.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            eq(contacts.storeId, storeId),
            eq(contacts.id, contactId),
            isNull(contacts.deletedAt),
          ),
        )
        .returning({ id: contacts.id }),
    );
    return row !== undefined;
  }
}
