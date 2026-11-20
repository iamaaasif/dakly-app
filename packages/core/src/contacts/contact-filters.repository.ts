import { arrayContains, eq, ilike, isNull, like, sql } from 'drizzle-orm';

import type { ContactKind } from '@dakly/contracts/contacts';
import { contacts } from '@dakly/db/schema/contacts';

import { escapeLike } from '../platform/database/escape-like';

// What the list and the export both filter by.
export type MatchFilter = {
  kind?: ContactKind;
  tag?: string;
  name?: string;
  phone?: string;
  phonePrefix?: string;
  cursor?: string;
};

export function matchingConditions(storeId: string, filter: MatchFilter) {
  return [
    eq(contacts.storeId, storeId),
    isNull(contacts.deletedAt),
    filter.kind ? eq(contacts.kind, filter.kind) : undefined,
    filter.tag ? arrayContains(contacts.tags, [filter.tag]) : undefined,
    filter.name ? ilike(contacts.name, `%${escapeLike(filter.name)}%`) : undefined,
    filter.phone ? eq(contacts.phone, filter.phone) : undefined,
    filter.phonePrefix ? like(contacts.phone, `${filter.phonePrefix}%`) : undefined,
  ];
}

export function cursorCondition(storeId: string, cursor: string | undefined) {
  return cursor
    ? sql`(${contacts.createdAt}, ${contacts.id}) <
              (select created_at, id from contacts where store_id = ${storeId} and id = ${cursor})`
    : undefined;
}
