import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

export type DueBalance = { balancePoisha: number; oldestDebtAt: Date | null };

export type DueCustomerRow = {
  contactId: string;
  name: string | null;
  phone: string | null;
  balancePoisha: number;
  oldestDebtAt: Date;
};

export type DueTotals = {
  totalOwedPoisha: number;
  customersOwing: number;
  overdueOwedPoisha: number;
  overdueCustomers: number;
};

export type DueCustomerCursor = { oldestDebtAt: Date; contactId: string };

// SHOP-R5. Payments and write-offs settle baki oldest first: a baki is open for whatever part of
// its running total (in date order) is above everything settled so far. Every balance in the Due
// book comes from this one definition, so the list, the totals and one customer always agree.
function openBaki(storeId: string, contactId?: string): SQL {
  const ofContact = contactId ? sql`and contact_id = ${contactId}` : sql``;
  return sql`
    settled as (
      select contact_id, sum(amount_poisha) as settled_poisha
      from due_entries
      where store_id = ${storeId} and kind in ('payment', 'write_off') ${ofContact}
      group by contact_id
    ),
    running as (
      select contact_id, occurred_at, amount_poisha,
        sum(amount_poisha) over (partition by contact_id order by occurred_at, id) as running_poisha
      from due_entries
      where store_id = ${storeId} and kind = 'baki' ${ofContact}
    ),
    open_baki as (
      select running.contact_id, running.occurred_at,
        greatest(0, least(running.amount_poisha,
          running.running_poisha - coalesce(settled.settled_poisha, 0))) as open_poisha
      from running left join settled using (contact_id)
    )`;
}

// Customers who still owe, never the ones who were removed from the customer list.
function owing(storeId: string, overdueBefore: Date): SQL {
  return sql`
    owing as (
      select open_baki.contact_id, contacts.name, contacts.phone,
        sum(open_poisha)::bigint as owed_poisha,
        min(occurred_at) filter (where open_poisha > 0) as oldest_debt_at,
        coalesce(sum(open_poisha) filter (where occurred_at < ${overdueBefore.toISOString()}::timestamptz), 0)::bigint
          as overdue_poisha
      from open_baki
      join contacts on contacts.store_id = ${storeId} and contacts.id = open_baki.contact_id
        and contacts.deleted_at is null
      group by open_baki.contact_id, contacts.name, contacts.phone
      having sum(open_poisha) > 0
    )`;
}

type RawRow = Record<string, string | number | Date | null>;

@Injectable()
export class DueBalancesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Negative when the customer has paid more than they owed.
  async balanceOf(storeId: string, contactId: string): Promise<DueBalance> {
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<RawRow>(sql`
        with ${openBaki(storeId, contactId)}
        select
          (select coalesce(sum(case when kind = 'baki' then amount_poisha else -amount_poisha end), 0)::bigint
            from due_entries where store_id = ${storeId} and contact_id = ${contactId}) as balance_poisha,
          (select min(occurred_at) from open_baki where open_poisha > 0) as oldest_debt_at`),
    );
    const row = result.rows[0]!;
    return {
      balancePoisha: Number(row.balance_poisha),
      oldestDebtAt: row.oldest_debt_at ? new Date(row.oldest_debt_at) : null,
    };
  }

  async totals(storeId: string, overdueBefore: Date): Promise<DueTotals> {
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<RawRow>(sql`
        with ${openBaki(storeId)}, ${owing(storeId, overdueBefore)}
        select coalesce(sum(owed_poisha), 0)::bigint as total_owed_poisha,
          count(*) as customers_owing,
          coalesce(sum(overdue_poisha), 0)::bigint as overdue_owed_poisha,
          count(*) filter (where overdue_poisha > 0) as overdue_customers
        from owing`),
    );
    const row = result.rows[0]!;
    return {
      totalOwedPoisha: Number(row.total_owed_poisha),
      customersOwing: Number(row.customers_owing),
      overdueOwedPoisha: Number(row.overdue_owed_poisha),
      overdueCustomers: Number(row.overdue_customers),
    };
  }

  // Oldest debt first, so the people most overdue are on the first page.
  async listOwing(
    storeId: string,
    query: {
      overdueBefore: Date;
      onlyOverdue: boolean;
      cursor?: DueCustomerCursor;
      limit: number;
    },
  ): Promise<DueCustomerRow[]> {
    const { overdueBefore, onlyOverdue, cursor, limit } = query;
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<RawRow>(sql`
        with ${openBaki(storeId)}, ${owing(storeId, overdueBefore)}
        select owing.contact_id, owing.owed_poisha, owing.oldest_debt_at, owing.name, owing.phone
        from owing
        where ${onlyOverdue ? sql`owing.overdue_poisha > 0` : sql`true`}
          and ${
            cursor
              ? sql`(owing.oldest_debt_at, owing.contact_id) > (${cursor.oldestDebtAt.toISOString()}::timestamptz, ${cursor.contactId}::uuid)`
              : sql`true`
          }
        order by owing.oldest_debt_at, owing.contact_id
        limit ${limit}`),
    );
    return result.rows.map((row) => ({
      contactId: String(row.contact_id),
      name: row.name === null ? null : String(row.name),
      phone: row.phone === null ? null : String(row.phone),
      balancePoisha: Number(row.owed_poisha),
      oldestDebtAt: new Date(row.oldest_debt_at!),
    }));
  }

  async collectedSince(storeId: string, since: Date): Promise<number> {
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<RawRow>(sql`
        select coalesce(sum(amount_poisha), 0)::bigint as collected_poisha
        from due_entries
        where store_id = ${storeId} and kind = 'payment' and occurred_at >= ${since.toISOString()}::timestamptz`),
    );
    return Number(result.rows[0]!.collected_poisha);
  }
}
