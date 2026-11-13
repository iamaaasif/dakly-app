import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  staffApprovalStatuses,
  staffRoles,
  staffStatuses,
  supportGrantAccess,
  supportGrantStatuses,
} from '@dakly/contracts/admin';
import { bytea, citext, createdAt, id, inet, isOneOf, timestamptz, updatedAt } from './columns';
import { users } from './auth';
import { stores } from './stores';

// Dakly staff for the admin app. Never shop users (feature 12).
export const staffUsers = pgTable(
  'staff_users',
  {
    id: id(),
    email: citext('email').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: staffRoles }).notNull(),
    status: text('status', { enum: staffStatuses }).notNull().default('active'),
    totpSecretCiphertext: bytea('totp_secret_ciphertext'),
    totpKeyVersion: smallint('totp_key_version'),
    // WebAuthn credentials: id, public key and sign counter for each passkey.
    passkeys: jsonb('passkeys').notNull().default([]),
    lastSignInAt: timestamptz('last_sign_in_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('staff_users_email_key').on(table.email),
    check('staff_users_role', isOneOf(table.role, staffRoles)),
    check('staff_users_status', isOneOf(table.status, staffStatuses)),
  ],
);

export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: id(),
    tokenHash: bytea('token_hash').notNull(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('staff_sessions_token_hash_key').on(table.tokenHash),
    index('staff_sessions_staff_user_id_idx').on(table.staffUserId),
  ],
);

// Append-only: the app role may insert and read, never update or delete (grants in the migration).
export const staffAuditLog = pgTable(
  'staff_audit_log',
  {
    id: id(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    action: text('action').notNull(),
    // No foreign key: the record must outlive a deleted store.
    storeId: uuid('store_id'),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    reason: text('reason').notNull(),
    data: jsonb('data'),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (table) => [
    index('staff_audit_log_staff_user_id_created_at_idx').on(table.staffUserId, table.createdAt),
    index('staff_audit_log_store_id_created_at_idx').on(table.storeId, table.createdAt),
    check('staff_audit_log_reason_length', sql`char_length(${table.reason}) >= 10`),
  ],
);

// Owner-approved, time-limited staff access to one store. Lives under the store's RLS so the
// owner approves it from inside the shop app.
export const supportGrants = pgTable(
  'support_grants',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    scopes: text('scopes').array().notNull(),
    access: text('access', { enum: supportGrantAccess }).notNull().default('read'),
    status: text('status', { enum: supportGrantStatuses }).notNull().default('requested'),
    reason: text('reason').notNull(),
    isBreakGlass: boolean('is_break_glass').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    requestedAt: timestamptz('requested_at').notNull().defaultNow(),
    approvedAt: timestamptz('approved_at'),
    expiresAt: timestamptz('expires_at'),
    endedAt: timestamptz('ended_at'),
  },
  (table) => [
    index('support_grants_store_id_status_idx').on(table.storeId, table.status),
    index('support_grants_staff_user_id_status_idx').on(table.staffUserId, table.status),
    index('support_grants_approved_by_user_id_idx').on(table.approvedByUserId),
    check('support_grants_access', isOneOf(table.access, supportGrantAccess)),
    check('support_grants_status', isOneOf(table.status, supportGrantStatuses)),
  ],
);

// Two-person approval (D16). The payload is frozen at request time; the hash proves it was
// not changed between approval and execution.
export const staffApprovals = pgTable(
  'staff_approvals',
  {
    id: id(),
    action: text('action').notNull(),
    storeId: uuid('store_id'),
    payload: jsonb('payload').notNull(),
    payloadHash: bytea('payload_hash').notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: staffApprovalStatuses }).notNull().default('pending'),
    requestedByStaffId: uuid('requested_by_staff_id')
      .notNull()
      .references(() => staffUsers.id),
    decidedByStaffId: uuid('decided_by_staff_id').references(() => staffUsers.id),
    expiresAt: timestamptz('expires_at').notNull(),
    decidedAt: timestamptz('decided_at'),
    executedAt: timestamptz('executed_at'),
    result: jsonb('result'),
    createdAt: createdAt(),
  },
  (table) => [
    index('staff_approvals_status_expires_at_idx').on(table.status, table.expiresAt),
    index('staff_approvals_requested_by_staff_id_idx').on(table.requestedByStaffId),
    index('staff_approvals_decided_by_staff_id_idx').on(table.decidedByStaffId),
    check('staff_approvals_status', isOneOf(table.status, staffApprovalStatuses)),
    check(
      'staff_approvals_second_person',
      sql`${table.decidedByStaffId} is null or ${table.decidedByStaffId} <> ${table.requestedByStaffId}`,
    ),
  ],
);

// Global key-value settings: AI tier to model map, WhatsApp rate card, VAT rate, feature flags,
// kill switches and announcements. Values are validated by a zod schema per key.
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedByStaffId: uuid('updated_by_staff_id').references(() => staffUsers.id),
  updatedAt: updatedAt(),
});
