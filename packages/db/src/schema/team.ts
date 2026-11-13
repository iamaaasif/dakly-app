import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { builtInRoles, membershipStatuses } from '@dakly/contracts/stores';
import { bytea, citext, createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { users } from './auth';
import { stores } from './stores';

// Custom roles only. The four built-in roles are code in team/permissions.ts, so the
// RLS policy needs no exception for rows without a store.
export const roles = pgTable(
  'roles',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    // Area to access level ('none', 'view', 'edit'), validated by the contracts schema.
    permissions: jsonb('permissions').notNull(),
    canSeeFullPhone: boolean('can_see_full_phone').notNull().default(false),
    canExportLists: boolean('can_export_lists').notNull().default(false),
    canRefund: boolean('can_refund').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('roles_store_id_name_key').on(table.storeId, table.name),
    check('roles_name_length', sql`char_length(${table.name}) between 1 and 60`),
  ],
);

// A user's place in a store. An invite is a membership with status 'invited' and a hashed
// token; user_id stays null until someone accepts it.
export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    userId: uuid('user_id').references(() => users.id),
    builtInRole: text('built_in_role', { enum: builtInRoles }),
    roleId: uuid('role_id').references(() => roles.id),
    status: text('status', { enum: membershipStatuses }).notNull(),
    invitePhone: text('invite_phone'),
    inviteEmail: citext('invite_email'),
    inviteTokenHash: bytea('invite_token_hash'),
    inviteExpiresAt: timestamptz('invite_expires_at'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    joinedAt: timestamptz('joined_at'),
    removedAt: timestamptz('removed_at'),
    lastActiveAt: timestamptz('last_active_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('memberships_store_id_user_id_key')
      .on(table.storeId, table.userId)
      .where(sql`${table.userId} is not null`),
    // At most one active Owner; "at least one" is a service rule (ACC-R6).
    uniqueIndex('memberships_one_owner_key')
      .on(table.storeId)
      .where(sql`${table.builtInRole} = 'owner' and ${table.status} = 'active'`),
    uniqueIndex('memberships_invite_token_hash_key').on(table.inviteTokenHash),
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_role_id_idx').on(table.roleId),
    index('memberships_invited_by_user_id_idx').on(table.invitedByUserId),
    check('memberships_status', isOneOf(table.status, membershipStatuses)),
    check('memberships_built_in_role', isOneOf(table.builtInRole, builtInRoles)),
    check('memberships_one_role', sql`(${table.builtInRole} is null) <> (${table.roleId} is null)`),
    check(
      'memberships_active_has_user',
      sql`${table.status} = 'invited' or ${table.userId} is not null`,
    ),
    check(
      'memberships_invite_has_address',
      sql`${table.status} <> 'invited' or ${table.invitePhone} is not null or ${table.inviteEmail} is not null`,
    ),
  ],
);
