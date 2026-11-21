import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { ContactImportRow, ContactKind, ContactSource } from '@dakly/contracts/contacts';
import { contacts } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type ImportMatch = {
  id: string;
  phone: string;
  importId: string | null;
  whatsappPhone: string | null;
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

@Injectable()
export class ImportContactsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Undo also restores the history of contacts removed since the import.
  async lockConsentHistory(storeId: string, ids: string[]): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.storeId, storeId), inArray(contacts.id, ids)))
        .orderBy(contacts.id)
        .for('no key update'),
    );
    return rows.map((row) => row.id);
  }

  // Contacts whose phone differs from one given phone in exactly one digit, with their names so
  // the caller can compare. Each phone becomes 11 patterns with one `_` wildcard.
  async findNearPhones(
    storeId: string,
    phones: string[],
  ): Promise<{ id: string; phone: string; name: string | null }[]> {
    if (phones.length === 0) return [];
    const patterns = phones.flatMap((phone) =>
      [...phone].map((_, index) => `${phone.slice(0, index)}_${phone.slice(index + 1)}`),
    );
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id, phone: contacts.phone, name: contacts.name })
        .from(contacts)
        .where(
          and(
            eq(contacts.storeId, storeId),
            isNull(contacts.deletedAt),
            sql`${contacts.phone} like any (${sql.param(patterns)}::text[])`,
          ),
        ),
    );
    return rows.map((row) => ({ ...row, phone: row.phone! }));
  }

  async findByPhones(storeId: string, phones: string[]): Promise<ImportMatch[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contacts.id,
          phone: contacts.phone,
          importId: contacts.importId,
          whatsappPhone: contacts.whatsappPhone,
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

  // Matched contacts are already locked in id order before the caller reads their consent.
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
    await this.database.forStore(storeId, async (tx) => {
      await tx.execute(sql`
        update contacts set
          name = coalesce(v.name, contacts.name),
          whatsapp_phone = coalesce(v.whatsapp_phone, contacts.whatsapp_phone),
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
      `);
    });
  }
}
