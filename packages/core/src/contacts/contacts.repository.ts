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
  ContactImportRow,
  ContactListQuery,
  ContactSource,
  CreateContactInput,
  UpdateContactInput,
} from '@dakly/contracts/contacts';
import type { SegmentCondition, SegmentInnerGroup, SegmentRules } from '@dakly/contracts/segments';
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

// What the send gate needs; the phone itself stays here.
export type ContactRecipient = {
  kind: ContactKind;
  isBlocked: boolean;
  isOverPlanLimit: boolean;
  hasPhone: boolean;
};

// An audience check also freezes the phone as each recipient's SMS destination.
export type AudienceRecipient = Omit<ContactRecipient, 'hasPhone'> & {
  id: string;
  phone: string | null;
};

export type NewContact = CreateContactInput & { source: ContactSource; kind: ContactKind };

export type ContactChange = UpdateContactInput & { phoneVerifiedAt?: null };

export type ImportMatch = {
  id: string;
  phone: string;
  importId: string | null;
  whatsappPhone: string | null;
  // The contact has an answer on WhatsApp, which an empty WhatsApp number would reassign.
  whatsappAnswered: boolean;
  tags: string[];
};

export type ImportedContactRow = ContactImportRow & {
  importId: string;
  source: ContactSource;
  kind: ContactKind;
};

// Undefined fields keep what the contact has, a saved WhatsApp number is kept, and tags are
// added to its own.
export type ImportedChange = Omit<ContactImportRow, 'phone'> & { id: string };

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

  async findRecipient(storeId: string, id: string): Promise<ContactRecipient | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          kind: contacts.kind,
          isBlocked: contacts.isBlocked,
          isOverPlanLimit: contacts.isOverPlanLimit,
          hasPhone: sql<boolean>`${contacts.phone} is not null`,
        })
        .from(contacts)
        .where(and(eq(contacts.storeId, storeId), eq(contacts.id, id), isNull(contacts.deletedAt)))
        .limit(1),
    );
    return rows[0];
  }

  findRecipients(storeId: string, ids: string[]): Promise<AudienceRecipient[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contacts.id,
          kind: contacts.kind,
          isBlocked: contacts.isBlocked,
          isOverPlanLimit: contacts.isOverPlanLimit,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(
          and(eq(contacts.storeId, storeId), inArray(contacts.id, ids), isNull(contacts.deletedAt)),
        ),
    );
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

  async findByPhones(storeId: string, phones: string[]): Promise<ImportMatch[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contacts.id,
          phone: contacts.phone,
          importId: contacts.importId,
          whatsappPhone: contacts.whatsappPhone,
          whatsappAnswered: sql<boolean>`exists (select 1 from ${contactConsentCurrent} where ${contactConsentCurrent.storeId} = ${storeId} and ${contactConsentCurrent.contactId} = ${contacts.id} and ${contactConsentCurrent.channel} = 'whatsapp')`,
          tags: contacts.tags,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.storeId, storeId),
            inArray(contacts.phone, phones),
            isNull(contacts.deletedAt),
          ),
        ),
    );
    return rows.map((row) => ({ ...row, phone: row.phone! }));
  }

  // No conflict clause: a phone saved by someone else meanwhile fails the caller's transaction,
  // and its retry finds that contact instead.
  async insertImported(
    storeId: string,
    rows: ImportedContactRow[],
  ): Promise<{ id: string; phone: string }[]> {
    if (rows.length === 0) return [];
    const inserted = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(contacts)
        .values(rows.map((row) => ({ ...row, storeId, tags: row.tags ?? [] })))
        .returning({ id: contacts.id, phone: contacts.phone }),
    );
    return inserted.map((row) => ({ ...row, phone: row.phone! }));
  }

  async updateImported(storeId: string, changes: ImportedChange[]): Promise<void> {
    if (changes.length === 0) return;
    const values = changes.map((change) => ({
      id: change.id,
      name: change.name,
      whatsapp_phone: change.whatsappPhone,
      email: change.email,
      address: change.address,
      district: change.district,
      notes: change.notes,
      tags: change.tags,
    }));
    await this.database.forStore(storeId, (tx) =>
      tx.execute(sql`
        update contacts set
          name = coalesce(v.name, contacts.name),
          whatsapp_phone = coalesce(contacts.whatsapp_phone, v.whatsapp_phone),
          email = coalesce(v.email::citext, contacts.email),
          address = coalesce(v.address, contacts.address),
          district = coalesce(v.district, contacts.district),
          notes = coalesce(v.notes, contacts.notes),
          tags = contacts.tags || array(
            select distinct tag from unnest(v.tags) as tag where tag <> all(contacts.tags)
          ),
          updated_at = now()
        from jsonb_to_recordset(${JSON.stringify(values)}::jsonb) as v(
          id uuid, name text, whatsapp_phone text, email text, address text, district text,
          notes text, tags text[]
        )
        where contacts.store_id = ${storeId} and contacts.id = v.id and contacts.deleted_at is null
      `),
    );
  }

  async lockForConsent(storeId: string, ids: string[]): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(eq(contacts.storeId, storeId), inArray(contacts.id, ids), isNull(contacts.deletedAt)),
        )
        .orderBy(contacts.id)
        .for('no key update'),
    );
    return rows.map((row) => row.id);
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

  async countMatching(storeId: string, rules: SegmentRules): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select({ count: count() }).from(contacts).where(matching(storeId, rules)),
    );
    return row!.count;
  }

  async listIdsMatching(
    storeId: string,
    rules: SegmentRules,
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
function matching(storeId: string, rules: SegmentRules): SQL | undefined {
  return and(
    eq(contacts.storeId, storeId),
    isNull(contacts.deletedAt),
    ne(contacts.kind, 'not_customer'),
    groupWhere(storeId, rules),
  );
}

function groupWhere(storeId: string, group: SegmentRules | SegmentInnerGroup): SQL | undefined {
  const parts = group.conditions.map((item: SegmentCondition | SegmentInnerGroup) =>
    'match' in item ? groupWhere(storeId, item) : conditionWhere(storeId, item),
  );
  return group.match === 'all' ? and(...parts) : or(...parts);
}

function conditionWhere(storeId: string, condition: SegmentCondition): SQL | undefined {
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
