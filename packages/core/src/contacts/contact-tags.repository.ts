import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { contacts } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ContactTagsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async inUse(storeId: string): Promise<string[]> {
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ tag: string }>(
        sql`select distinct unnest(${contacts.tags}) as tag from ${contacts}
            where ${contacts.storeId} = ${storeId} and ${contacts.deletedAt} is null order by 1`,
      ),
    );
    return result.rows.map((row) => row.tag);
  }
}
