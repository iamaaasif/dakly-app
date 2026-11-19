import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import { contacts, contactStats } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type ContactStatsWrite = Omit<
  typeof contactStats.$inferInsert,
  'storeId' | 'contactId' | 'favouriteCategory' | 'netSpendPoisha'
> & { netSpendPoisha: bigint };

export type BestSpendCutoff = { contactId: string; netSpendPoisha: string };

@Injectable()
export class ContactStatsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  contactIds(storeId: string, after: string | null, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.storeId, storeId), after ? gt(contacts.id, after) : undefined))
        .orderBy(asc(contacts.id))
        .limit(limit),
    );
  }

  async contactsWithChangedRank(
    storeId: string,
    after: string | null,
    { cutoff, minimum, limit }: { cutoff: BestSpendCutoff | null; minimum: bigint; limit: number },
  ) {
    const cursor = after ? sql`and contact_id > ${after}::uuid` : sql``;
    const qualifies = cutoff
      ? sql`net_spend_poisha > ${minimum.toString()}::bigint
            and net_spend_poisha >= ${cutoff.netSpendPoisha}::bigint
            and (net_spend_poisha, contact_id) >=
                (${cutoff.netSpendPoisha}::bigint, ${cutoff.contactId}::uuid)`
      : sql`false`;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ id: string }>(sql`
        select id from (
          (select contact_id as id from contact_stats
           where store_id = ${storeId} and lifecycle_stage = 'best' ${cursor}
             and not (${qualifies})
           order by contact_id limit ${limit})
          union all
          (select contact_id as id from contact_stats
           where store_id = ${storeId} and lifecycle_stage not in ('none', 'stopped_buying', 'best')
             ${cursor} and (${qualifies})
           order by contact_id limit ${limit})
        ) candidates order by id limit ${limit}`),
    );
    return rows;
  }

  countLifecycleStages(storeId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ stage: contactStats.lifecycleStage, count: count() })
        .from(contactStats)
        .innerJoin(
          contacts,
          and(eq(contacts.storeId, storeId), eq(contacts.id, contactStats.contactId)),
        )
        .where(
          and(
            eq(contactStats.storeId, storeId),
            ne(contactStats.lifecycleStage, 'none'),
            isNull(contacts.deletedAt),
            eq(contacts.isBlocked, false),
            ne(contacts.kind, 'not_customer'),
          ),
        )
        .groupBy(contactStats.lifecycleStage),
    );
  }

  async bestSpendCutoff(storeId: string) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<BestSpendCutoff>(sql`
        with customers as not materialized (
          select s.contact_id, s.net_spend_poisha
          from contact_stats s join contacts c on c.store_id = s.store_id and c.id = s.contact_id
          where s.store_id = ${storeId} and s.lifecycle_stage <> 'none'
            and c.deleted_at is null and not c.is_blocked and c.kind <> 'not_customer'
        ), quota as (select count(*) / 10 as best from customers)
        select contact_id as "contactId", net_spend_poisha::text as "netSpendPoisha"
        from customers
        where (select best from quota) > 0
        order by net_spend_poisha desc, contact_id desc
        offset (select greatest(best - 1, 0) from quota) limit 1`),
    );
    return rows[0] ?? null;
  }

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
