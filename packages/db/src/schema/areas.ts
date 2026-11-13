import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { bdAreaKinds } from '@dakly/contracts/orders';
import { isOneOf } from './columns';

// Global reference list of Bangladesh divisions, districts and upazilas, seeded by migration.
// Ids are fixed so delivery zones and addresses can store them.
export const bdAreas = pgTable(
  'bd_areas',
  {
    id: integer('id').primaryKey(),
    kind: text('kind', { enum: bdAreaKinds }).notNull(),
    parentId: integer('parent_id').references((): AnyPgColumn => bdAreas.id),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
  },
  (table) => [
    index('bd_areas_parent_id_idx').on(table.parentId),
    check('bd_areas_kind', isOneOf(table.kind, bdAreaKinds)),
    check('bd_areas_parent', sql`(${table.kind} = 'division') = (${table.parentId} is null)`),
  ],
);
