import { sql, type SQL } from 'drizzle-orm';
import { bigint, customType, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../uuid-v7';

// Column shapes every table shares. See docs/rules/database.md.
export const id = () => uuid('id').primaryKey().$defaultFn(uuidv7);

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();

export const updatedAt = () =>
  timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Money is an integer number of poisha. Number mode is exact up to 2^53 poisha (about 90 trillion taka).
export const poisha = (name: string) => bigint(name, { mode: 'number' });

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const inet = customType<{ data: string }>({ dataType: () => 'inet' });

// Builds the CHECK for a text column limited to a list from packages/contracts.
export function isOneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  return sql`${column} in (${sql.raw(list)})`;
}

// Same for a text[] column: every element must be in the list.
export function allOneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  return sql`${column} <@ array[${sql.raw(list)}]::text[]`;
}
