import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

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
            .set({ phone, phoneVerifiedAt: null, updatedAt: now })
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
      'contactId' | 'matchedContactId' | 'phone' | 'orderId' | 'createdAt'
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
