import { arrayContains, eq, gte, ilike, isNull, like, lte, or, type SQL, sql } from 'drizzle-orm';

import type {
  ContactKind,
  ContactListQuery,
  ContactListType,
  ContactSource,
} from '@dakly/contracts/contacts';
import { contacts, contactStats } from '@dakly/db/schema/contacts';

import { escapeLike } from '../platform/database/escape-like';

// What the list and the export both filter by.
export type MatchFilter = {
  kind?: ContactKind;
  tag?: string;
  source?: ContactSource;
  name?: string;
  // The customer list also finds a name text in the email and the area.
  matchEmailAndArea?: boolean;
  phone?: string;
  phonePrefix?: string;
  cursor?: string;
  type?: ContactListType;
  hasOrdered?: boolean;
  minSpendPoisha?: number;
  maxSpendPoisha?: number;
  lastPurchase?: ContactListQuery['lastPurchase'];
};

export type ContactSort = ContactListQuery['sort'];

const lifecycleStagesByType = {
  new: ['new'],
  returning: ['regulars'],
  vip: ['best'],
  inactive: ['stopped_buying'],
  at_risk: ['slipping_away'],
} as const;

export function matchingConditions(storeId: string, filter: MatchFilter) {
  return [
    eq(contacts.storeId, storeId),
    isNull(contacts.deletedAt),
    filter.kind ? eq(contacts.kind, filter.kind) : undefined,
    filter.source ? eq(contacts.source, filter.source) : undefined,
    filter.tag ? arrayContains(contacts.tags, [filter.tag]) : undefined,
    filter.name ? nameCondition(filter.name, filter.matchEmailAndArea) : undefined,
    filter.phone ? eq(contacts.phone, filter.phone) : undefined,
    filter.phonePrefix ? like(contacts.phone, `${filter.phonePrefix}%`) : undefined,
  ];
}

function nameCondition(name: string, matchEmailAndArea: boolean | undefined) {
  const pattern = `%${escapeLike(name)}%`;
  return matchEmailAndArea
    ? or(
        ilike(contacts.name, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.district, pattern),
      )
    : ilike(contacts.name, pattern);
}

// For queries that left join contact_stats on the contact.
export function statsConditions(storeId: string, filter: MatchFilter): (SQL | undefined)[] {
  return [
    filter.type ? typeCondition(filter.type, storeId) : undefined,
    filter.hasOrdered ? hasOrderedCondition() : undefined,
    filter.minSpendPoisha === undefined
      ? undefined
      : gte(sql`coalesce(${contactStats.netSpendPoisha}, 0)`, filter.minSpendPoisha),
    filter.maxSpendPoisha === undefined
      ? undefined
      : lte(sql`coalesce(${contactStats.netSpendPoisha}, 0)`, filter.maxSpendPoisha),
    filter.lastPurchase ? lastPurchaseCondition(filter.lastPurchase) : undefined,
  ];
}

// contact_stats counts only non-cancelled orders, including store sync, POS and khata imports.
export function hasOrderedCondition() {
  return sql`(coalesce(${contactStats.ordersCount}, 0) > 0 and not ${contacts.isBlocked} and ${contacts.kind} <> 'not_customer')`;
}

// Top 10% of customers by net spend, at least one customer, whatever their stage. A customer is
// anyone the stats count, as in the best customers rule. Nobody qualifies with no spend or no
// customers.
// The threshold depends only on the store, so it is bound as a parameter and Postgres runs it once.
export function isHighValue(storeId: string) {
  return sql<boolean>`coalesce(${contactStats.netSpendPoisha} > 0 and ${contactStats.netSpendPoisha} >= (
  select s.net_spend_poisha
  from contact_stats s join contacts c on c.store_id = s.store_id and c.id = s.contact_id
  where s.store_id = ${storeId}::uuid and s.lifecycle_stage <> 'none'
    and c.deleted_at is null and not c.is_blocked and c.kind <> 'not_customer'
  order by s.net_spend_poisha desc
  offset (
    select greatest(count(*) / 10 - 1, 0)
    from contact_stats s2 join contacts c2 on c2.store_id = s2.store_id and c2.id = s2.contact_id
    where s2.store_id = ${storeId}::uuid and s2.lifecycle_stage <> 'none'
      and c2.deleted_at is null and not c2.is_blocked and c2.kind <> 'not_customer'
  ) limit 1
), false)`;
}

function typeCondition(type: ContactListType, storeId: string) {
  if (type === 'high_value') return isHighValue(storeId);
  return sql`${contactStats.lifecycleStage} in (${sql.join(
    lifecycleStagesByType[type].map((stage) => sql`${stage}`),
    sql`, `,
  )})`;
}

const WINDOW_DAYS = { '7_days': 7, '30_days': 30, '90_days': 90 } as const;

function lastPurchaseCondition(window: NonNullable<ContactListQuery['lastPurchase']>) {
  if (window === 'never') return isNull(contactStats.lastOrderAt);
  if (window === 'over_90_days')
    return sql`${contactStats.lastOrderAt} < now() - interval '90 days'`;
  return sql`${contactStats.lastOrderAt} >= now() - make_interval(days => ${WINDOW_DAYS[window]})`;
}

// Each sort is one key with a direction; contacts without stats count as no orders and no spend.
// The refs are fixed names, never input, so the cursor lookup can use its own aliases.
const sortKeys: Record<
  ContactSort,
  { key: (contact: string, stats: string) => string; descending: boolean }
> = {
  newest: { key: (contact) => `${contact}.created_at`, descending: true },
  last_purchase: {
    key: (_contact, stats) => `coalesce(${stats}.last_order_at, 'epoch'::timestamptz)`,
    descending: true,
  },
  highest_spend: {
    key: (_contact, stats) => `coalesce(${stats}.net_spend_poisha, 0)`,
    descending: true,
  },
  most_orders: { key: (_contact, stats) => `coalesce(${stats}.orders_count, 0)`, descending: true },
  name: { key: (contact) => `lower(coalesce(${contact}.name, ''))`, descending: false },
};

export function listOrdering(sort: ContactSort) {
  const { key, descending } = sortKeys[sort];
  const direction = sql.raw(descending ? 'desc' : 'asc');
  return [
    sql`${sql.raw(key('contacts', 'contact_stats'))} ${direction}`,
    sql`contacts.id ${direction}`,
  ];
}

// The cursor is the last contact's id; its sort key is read back, so a page never repeats a row.
export function cursorCondition(
  storeId: string,
  cursor: string | undefined,
  sort: ContactSort = 'newest',
) {
  if (!cursor) return undefined;
  const { key, descending } = sortKeys[sort];
  const after = sql.raw(descending ? '<' : '>');
  return sql`(${sql.raw(key('contacts', 'contact_stats'))}, contacts.id) ${after}
    (select ${sql.raw(key('cc', 'cs'))}, cc.id from contacts cc
      left join contact_stats cs on cs.store_id = cc.store_id and cs.contact_id = cc.id
      where cc.store_id = ${storeId} and cc.id = ${cursor})`;
}
