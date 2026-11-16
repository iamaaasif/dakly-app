import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNull,
  like,
  ne,
  not,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { type PgColumn, QueryBuilder } from 'drizzle-orm/pg-core';

import type {
  ConsentChannel,
  ContactIdentityResponse,
  ContactKind,
  ContactListQuery,
  ContactSource,
  CreateContactInput,
  UpdateContactInput,
} from '@dakly/contracts/contacts';
import type { AvailableSegmentCondition, AvailableSegmentRules } from '@dakly/contracts/segments';
import { contactConsentCurrent } from '@dakly/db/schema/consents';
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

  async countMatching(storeId: string, rules: AvailableSegmentRules): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select({ count: count() }).from(contacts).where(matching(storeId, rules)),
    );
    return row!.count;
  }

  async listIdsMatching(
    storeId: string,
    rules: AvailableSegmentRules,
    page: { cursor?: string; limit: number },
  ): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(matching(storeId, rules), page.cursor ? gt(contacts.id, page.cursor) : undefined),
        )
        .orderBy(asc(contacts.id))
        .limit(page.limit),
    );
    return rows.map((row) => row.id);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// Segments compile here because contacts owns the table (module-boundaries.md). Every value is a
// bound parameter. Not a customer and deleted contacts never match.
function matching(storeId: string, rules: AvailableSegmentRules): SQL | undefined {
  return and(
    eq(contacts.storeId, storeId),
    isNull(contacts.deletedAt),
    ne(contacts.kind, 'not_customer'),
    groupWhere(storeId, rules),
  );
}

function groupWhere(storeId: string, group: AvailableSegmentRules): SQL | undefined {
  const parts = group.conditions.map((item) =>
    'match' in item ? groupWhere(storeId, item) : conditionWhere(storeId, item),
  );
  return group.match === 'all' ? and(...parts) : or(...parts);
}

function conditionWhere(storeId: string, condition: AvailableSegmentCondition): SQL | undefined {
  switch (condition.field) {
    case 'tag':
      return condition.operator === 'is_any_of'
        ? arrayOverlaps(contacts.tags, condition.values)
        : not(arrayOverlaps(contacts.tags, condition.values));
    case 'district':
      return listWhere(contacts.district, condition);
    case 'source':
      return listWhere(contacts.source, condition);
    case 'kind':
      return listWhere(contacts.kind, condition);
    case 'consent':
      return condition.granted
        ? exists(granted(storeId, condition.channel))
        : not(exists(granted(storeId, condition.channel)));
  }
}

// "Is not Dhaka" keeps contacts with no district.
function listWhere(
  column: PgColumn,
  condition: { operator: 'is_any_of' | 'is_none_of'; values: string[] },
): SQL | undefined {
  return condition.operator === 'is_any_of'
    ? inArray(column, condition.values)
    : or(isNull(column), not(inArray(column, condition.values)));
}

const query = new QueryBuilder();

function granted(storeId: string, channel: ConsentChannel) {
  return query
    .select({ contactId: contactConsentCurrent.contactId })
    .from(contactConsentCurrent)
    .where(
      and(
        eq(contactConsentCurrent.storeId, storeId),
        eq(contactConsentCurrent.contactId, contacts.id),
        eq(contactConsentCurrent.channel, channel),
        eq(contactConsentCurrent.status, 'granted'),
      ),
    );
}
