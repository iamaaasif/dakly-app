import { Inject, Injectable } from '@nestjs/common';
import { and, desc } from 'drizzle-orm';

import type { ContactSource } from '@dakly/contracts/contacts';
import { contacts } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';
import {
  cursorCondition,
  matchingConditions,
  type MatchFilter,
} from './contact-filters.repository';
import type { Contact } from './contacts.repository';

export type ExportedContact = Contact & {
  whatsappPhone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  source: ContactSource;
};

@Injectable()
export class ContactExportRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // One page of what the list's filters match, with the columns a spreadsheet carries.
  page(storeId: string, filter: MatchFilter, limit: number): Promise<ExportedContact[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          kind: contacts.kind,
          tags: contacts.tags,
          createdAt: contacts.createdAt,
          whatsappPhone: contacts.whatsappPhone,
          email: contacts.email,
          address: contacts.address,
          district: contacts.district,
          source: contacts.source,
        })
        .from(contacts)
        .where(and(...matchingConditions(storeId, filter), cursorCondition(storeId, filter.cursor)))
        .orderBy(desc(contacts.createdAt), desc(contacts.id))
        .limit(limit),
    );
  }
}
