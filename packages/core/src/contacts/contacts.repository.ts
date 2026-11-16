import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { ContactKind, CreateContactInput } from '@dakly/contracts/contacts';
import { contacts } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  kind: ContactKind;
  createdAt: Date;
};

const contactColumns = {
  id: contacts.id,
  name: contacts.name,
  phone: contacts.phone,
  kind: contacts.kind,
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

  // Returns undefined when the phone already exists in this store. A staff add is an
  // intentional customer under the glossary.
  async insert(storeId: string, input: CreateContactInput): Promise<Contact | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(contacts)
        .values({
          storeId,
          name: input.name,
          phone: input.phone,
          source: 'manual',
          kind: 'customer',
        })
        .onConflictDoNothing()
        .returning(contactColumns),
    );
    return rows[0];
  }
}
