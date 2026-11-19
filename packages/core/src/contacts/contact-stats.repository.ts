import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { contacts, contactStats } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type ContactStatsWrite = Omit<
  typeof contactStats.$inferInsert,
  'storeId' | 'contactId' | 'favouriteCategory' | 'netSpendPoisha'
> & { netSpendPoisha: bigint };

@Injectable()
export class ContactStatsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async lockContact(storeId: string, contactId: string) {
    const [contact] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          kind: contacts.kind,
          source: contacts.source,
          createdAt: contacts.createdAt,
          isBlocked: contacts.isBlocked,
          deletedAt: contacts.deletedAt,
        })
        .from(contacts)
        .where(and(eq(contacts.storeId, storeId), eq(contacts.id, contactId)))
        .for('no key update'),
    );
    return contact;
  }

  async lifecycleStage(storeId: string, contactId: string) {
    const [stats] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ stage: contactStats.lifecycleStage })
        .from(contactStats)
        .where(and(eq(contactStats.storeId, storeId), eq(contactStats.contactId, contactId))),
    );
    return stats?.stage;
  }

  async save(storeId: string, contactId: string, stats: ContactStatsWrite) {
    const values = { ...stats, netSpendPoisha: sql`${stats.netSpendPoisha.toString()}::bigint` };
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(contactStats)
        .values({ ...values, storeId, contactId })
        .onConflictDoUpdate({
          target: contactStats.contactId,
          set: values,
          setWhere: sql`
          ${contactStats.storeId} = ${storeId} and
          (${contactStats.ordersCount}, ${contactStats.deliveredCount}, ${contactStats.returnedCount},
           ${contactStats.netSpendPoisha}, ${contactStats.firstOrderAt}, ${contactStats.lastOrderAt},
           ${contactStats.usualGapDays}, ${contactStats.lifecycleStage})
          is distinct from
          (excluded.orders_count, excluded.delivered_count, excluded.returned_count,
           excluded.net_spend_poisha, excluded.first_order_at, excluded.last_order_at,
           excluded.usual_gap_days, excluded.lifecycle_stage)`,
        }),
    );
  }
}
