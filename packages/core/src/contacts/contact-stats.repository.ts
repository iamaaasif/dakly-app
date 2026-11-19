import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type { ContactSource } from '@dakly/contracts/contacts';
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

  contactsWithChangedRank(
    storeId: string,
    after: string | null,
    { cutoff, minimum, limit }: { cutoff: BestSpendCutoff | null; minimum: bigint; limit: number },
  ) {
    const qualifies = cutoff
      ? sql`${contactStats.lifecycleStage} not in ('none', 'stopped_buying')
            and ${contactStats.netSpendPoisha} > ${minimum.toString()}::bigint
            and (${contactStats.netSpendPoisha}, ${contactStats.contactId}) >=
                (${cutoff.netSpendPoisha}::bigint, ${cutoff.contactId}::uuid)`
      : sql`false`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: contacts.id })
        .from(contacts)
        .innerJoin(
          contactStats,
          and(eq(contactStats.storeId, storeId), eq(contactStats.contactId, contacts.id)),
        )
        .where(
          and(
            eq(contacts.storeId, storeId),
            after ? gt(contacts.id, after) : undefined,
            sql`(${contactStats.lifecycleStage} = 'best') <> (${qualifies})`,
          ),
        )
        .orderBy(asc(contacts.id))
        .limit(limit),
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

  async bestBySpend(
    storeId: string,
    contactId: string,
    netSpendPoisha: bigint,
    intentionalSources: readonly ContactSource[],
  ) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ best: boolean }>(sql`
      with higher_spenders as (
        select count(*) as people
        from contact_stats s join contacts c on c.store_id = s.store_id and c.id = s.contact_id
        where s.store_id = ${storeId} and s.contact_id <> ${contactId}
          and s.net_spend_poisha >= ${netSpendPoisha.toString()}::bigint
          and (s.net_spend_poisha, c.id) > (${netSpendPoisha.toString()}::bigint, ${contactId}::uuid)
          and c.deleted_at is null and not c.is_blocked and c.kind <> 'not_customer'
      )
      select exists (
        select 1
        from contacts c left join contact_stats s on s.store_id = c.store_id and s.contact_id = c.id
        where c.store_id = ${storeId} and c.deleted_at is null and not c.is_blocked
          and c.kind <> 'not_customer'
          and (c.id = ${contactId} or s.orders_count > 0 or (
            c.kind = 'customer' and c.source = any(${sql.param(intentionalSources)}::text[])
          ))
        offset (select people * 10 + 9 from higher_spenders)
      ) as best
    `),
    );
    return rows[0]!.best;
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
