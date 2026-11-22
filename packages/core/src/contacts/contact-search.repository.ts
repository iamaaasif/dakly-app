import { Inject, Injectable } from '@nestjs/common';
import { and } from 'drizzle-orm';

import { contacts } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';
import { matchingConditions, type MatchFilter } from './contact-filters.repository';

@Injectable()
export class ContactSearchRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findIds(storeId: string, filter: MatchFilter, limit: number): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(...matchingConditions(storeId, filter)))
        .limit(limit),
    );
    return rows.map((row) => row.id);
  }
}
