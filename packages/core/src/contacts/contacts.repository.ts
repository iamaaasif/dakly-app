import { Inject, Injectable } from '@nestjs/common';
import { and, arrayContains, desc, eq, ilike, isNull, like, sql } from 'drizzle-orm';

import type {
  ContactIdentityResponse,
  ContactKind,
  ContactListQuery,
  ContactSource,
  CreateContactInput,
  UpdateContactInput,
} from '@dakly/contracts/contacts';
import { contactIdentities, contacts } from '@dakly/db/schema/contacts';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  kind: ContactKind;
  tags: string[];
  createdAt: Date;
};

export type NewContact = CreateContactInput & { source: ContactSource; kind: ContactKind };

export type ContactChange = UpdateContactInput & { phoneVerifiedAt?: null };

// The service decides what a search means; each search field has its own index.
export type ContactFilter = Omit<ContactListQuery, 'search'> & {
  name?: string;
  phone?: string;
  phonePrefix?: string;
};

const contactColumns = {
  id: contacts.id,
  name: contacts.name,
  phone: contacts.phone,
  kind: contacts.kind,
  tags: contacts.tags,
  createdAt: contacts.createdAt,
};

@Injectable()
export class ContactsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findById(storeId: string, id: string): Promise<Contact | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(contactColumns)
        .from(contacts)
        .where(and(eq(contacts.storeId, storeId), eq(contacts.id, id), isNull(contacts.deletedAt)))
        .limit(1),
    );
    return rows[0];
  }

  list(storeId: string, filter: ContactFilter): Promise<Contact[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(contactColumns)
        .from(contacts)
        .where(
          and(
            eq(contacts.storeId, storeId),
            isNull(contacts.deletedAt),
            filter.kind ? eq(contacts.kind, filter.kind) : undefined,
            filter.tag ? arrayContains(contacts.tags, [filter.tag]) : undefined,
            filter.name ? ilike(contacts.name, `%${escapeLike(filter.name)}%`) : undefined,
            filter.phone ? eq(contacts.phone, filter.phone) : undefined,
            filter.phonePrefix ? like(contacts.phone, `${filter.phonePrefix}%`) : undefined,
            filter.cursor
              ? sql`(${contacts.createdAt}, ${contacts.id}) <
              (select created_at, id from contacts where store_id = ${storeId} and id = ${filter.cursor})`
              : undefined,
          ),
        )
        .orderBy(desc(contacts.createdAt), desc(contacts.id))
        .limit(filter.limit + 1),
    );
  }

  findIdentities(storeId: string, contactId: string): Promise<ContactIdentityResponse[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contactIdentities.id,
          channel: contactIdentities.channel,
          channelConnectionId: contactIdentities.channelConnectionId,
          profileName: contactIdentities.profileName,
        })
        .from(contactIdentities)
        .where(
          and(eq(contactIdentities.storeId, storeId), eq(contactIdentities.contactId, contactId)),
        )
        .orderBy(contactIdentities.createdAt, contactIdentities.id),
    );
  }

  // Returns undefined when the phone already exists in this store.
  async insert(storeId: string, contact: NewContact): Promise<Contact | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(contacts)
        .values({ storeId, ...contact })
        .onConflictDoNothing({
          target: [contacts.storeId, contacts.phone],
          where: sql`${contacts.phone} is not null and ${contacts.deletedAt} is null`,
        })
        .returning(contactColumns),
    );
    return rows[0];
  }

  // Returns undefined for a missing or deleted contact.
  async update(
    storeId: string,
    id: string,
    change: ContactChange,
  ): Promise<Contact | 'phone_taken' | undefined> {
    try {
      const rows = await this.database.forStore(storeId, (tx) =>
        tx
          .update(contacts)
          .set(change)
          .where(
            and(eq(contacts.storeId, storeId), eq(contacts.id, id), isNull(contacts.deletedAt)),
          )
          .returning(contactColumns),
      );
      return rows[0];
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'contacts_store_id_phone_key'))
        return 'phone_taken';
      throw error;
    }
  }

  async softDelete(storeId: string, id: string, deletedAt: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(contacts)
        .set({ deletedAt })
        .where(and(eq(contacts.storeId, storeId), eq(contacts.id, id), isNull(contacts.deletedAt)))
        .returning({ id: contacts.id }),
    );
    return rows.length > 0;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
