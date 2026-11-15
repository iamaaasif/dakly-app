import { sql } from 'drizzle-orm';
import {
  bigint,
  foreignKey,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  abuseReportCategories,
  abuseReportSources,
  abuseReportStatuses,
  staffRoles,
  staffStatuses,
  supportGrantAccess,
  supportGrantStatuses,
} from '@dakly/contracts/admin';

import { users } from './auth';
import { bytea, citext, createdAt, id, inet, isOneOf, timestamptz, updatedAt } from './columns';
import { stores } from './stores';

// Dakly staff for the admin app. Never shop users (feature 12).
export const staffUsers = pgTable(
  'staff_users',
  {
    id: id(),
    email: citext('email').notNull(),
    name: text('name').notNull(),
    accessSubject: text('access_subject'),
    passwordHash: text('password_hash'),
    enrolledAt: timestamptz('enrolled_at'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    blockedUntil: timestamptz('blocked_until'),
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),
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
    uniqueIndex('staff_users_access_subject_key').on(table.accessSubject),
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
    lastSeenAt: timestamptz('last_seen_at'),
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
// Every risky action writes its row before it runs (D28). If two-person approval is added later,
// the action records the approval's id in action_details; nothing here changes. Each day is
// sealed into staff_audit_log_days, so a changed or removed row breaks the chain (ADM-R11).
export const staffAuditLog = pgTable(
  'staff_audit_log',
  {
    id: id(),
    operatorIdentity: text('operator_identity'),
    actorUserId: uuid('actor_user_id'),
    staffUserId: uuid('staff_user_id').references(() => staffUsers.id),
    action: text('action').notNull(),
    // No foreign key: the record must outlive a deleted store.
    storeId: uuid('store_id'),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    reason: text('reason').notNull(),
    actionDetails: jsonb('action_details'),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (table) => [
    index('staff_audit_log_order_idx').on(table.createdAt, table.id),
    index('staff_audit_log_action_idx').on(table.action, table.createdAt, table.id),
    index('staff_audit_log_staff_user_id_created_at_idx').on(table.staffUserId, table.createdAt),
    index('staff_audit_log_store_id_created_at_idx').on(table.storeId, table.createdAt),
    check(
      'staff_audit_log_actor',
      sql`num_nonnulls(${table.staffUserId}, ${table.operatorIdentity}, ${table.actorUserId}) = 1`,
    ),
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
    durationMinutes: integer('duration_minutes').notNull().default(30),
    isBreakGlass: boolean('is_break_glass').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    requestedAt: timestamptz('requested_at').notNull().defaultNow(),
    approvedAt: timestamptz('approved_at'),
    expiresAt: timestamptz('expires_at'),
    endedAt: timestamptz('ended_at'),
  },
  (table) => [
    uniqueIndex('support_grants_store_id_id_key').on(table.storeId, table.id),
    index('support_grants_staff_id_idx').on(table.staffUserId, table.id),
    index('support_grants_store_id_idx').on(table.storeId, table.id),
    check('support_grants_duration', sql`${table.durationMinutes} between 30 and 1440`),
    index('support_grants_store_id_status_idx').on(table.storeId, table.status),
    index('support_grants_staff_user_id_status_idx').on(table.staffUserId, table.status),
    index('support_grants_approved_by_user_id_idx').on(table.approvedByUserId),
    check('support_grants_access', isOneOf(table.access, supportGrantAccess)),
    check('support_grants_status', isOneOf(table.status, supportGrantStatuses)),
  ],
);

// Global key-value settings: AI tier to model map, WhatsApp rate card, VAT rate, feature flags,
// kill switches and announcements. Values are validated by a zod schema per key.
export const platformSettings = pgTable(
  'platform_settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    updatedByStaffId: uuid('updated_by_staff_id').references(() => staffUsers.id),
    updatedAt: updatedAt(),
  },
  (table) => [index('platform_settings_updated_by_staff_id_idx').on(table.updatedByStaffId)],
);

// ADM-R11 daily hash chain. A nightly job seals each finished UTC day: hash = sha256 of the
// previous day's hash and that day's rows in (created_at, id) order. Kept 7 years.
export const staffAuditLogDays = pgTable(
  'staff_audit_log_days',
  {
    day: date('day').primaryKey(),
    rowCount: integer('row_count').notNull(),
    previousHash: bytea('previous_hash'),
    hash: bytea('hash').notNull(),
    sealedAt: timestamptz('sealed_at').notNull(),
  },
  (table) => [check('staff_audit_log_days_row_count', sql`${table.rowCount} >= 0`)],
);

// The abuse and compliance queue: provider warnings, customer complaints, staff and system flags.
export const abuseReports = pgTable(
  'abuse_reports',
  {
    id: id(),
    // No foreign key: the report must outlive a deleted store.
    storeId: uuid('store_id').notNull(),
    source: text('source', { enum: abuseReportSources }).notNull(),
    category: text('category', { enum: abuseReportCategories }).notNull(),
    status: text('status', { enum: abuseReportStatuses }).notNull().default('open'),
    description: text('description').notNull(),
    evidence: jsonb('evidence'),
    reportedByStaffId: uuid('reported_by_staff_id').references(() => staffUsers.id),
    handledByStaffId: uuid('handled_by_staff_id').references(() => staffUsers.id),
    resolution: text('resolution'),
    resolvedAt: timestamptz('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('abuse_reports_open_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'open'`),
    index('abuse_reports_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('abuse_reports_reported_by_staff_id_idx').on(table.reportedByStaffId),
    index('abuse_reports_handled_by_staff_id_idx').on(table.handledByStaffId),
    check('abuse_reports_source', isOneOf(table.source, abuseReportSources)),
    check('abuse_reports_category', isOneOf(table.category, abuseReportCategories)),
    check('abuse_reports_status', isOneOf(table.status, abuseReportStatuses)),
  ],
);

// Provisioning establishes these contacts; the browser cannot change conflict evidence.
export const staffIdentityContacts = pgTable(
  'staff_identity_contacts',
  {
    id: id(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    kind: text('kind', { enum: ['phone', 'email'] }).notNull(),
    value: text('value').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('staff_identity_contacts_value_idx').on(table.kind, table.value),
    uniqueIndex('staff_identity_contacts_staff_value_key').on(
      table.staffUserId,
      table.kind,
      table.value,
    ),
    check('staff_identity_contacts_kind', sql`${table.kind} in ('phone', 'email')`),
  ],
);
export const staffPasskeys = pgTable(
  'staff_passkeys',
  {
    credentialId: text('credential_id').primaryKey(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    publicKey: bytea('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('staff_passkeys_staff_user_id_idx').on(table.staffUserId)],
);
export const staffChallenges = pgTable(
  'staff_challenges',
  {
    tokenHash: bytea('token_hash').primaryKey(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    purpose: text('purpose', {
      enum: ['enroll', 'signin', 'setup_totp', 'setup_passkey'],
    }).notNull(),
    passwordHash: text('password_hash'),
    passwordState: text('password_state'),
    webauthnChallenge: text('webauthn_challenge'),
    totpSecretCiphertext: bytea('totp_secret_ciphertext'),
    totpKeyVersion: smallint('totp_key_version'),
    expiresAt: timestamptz('expires_at').notNull(),
    consumedAt: timestamptz('consumed_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('staff_challenges_staff_user_id_idx').on(table.staffUserId),
    check(
      'staff_challenges_purpose',
      sql`${table.purpose} in ('enroll', 'signin', 'setup_totp', 'setup_passkey')`,
    ),
  ],
);

// Established links survive changes to either identity's contact details.
export const staffUserLinks = pgTable(
  'staff_user_links',
  {
    id: id(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('staff_user_links_identity_key').on(table.staffUserId, table.userId),
    index('staff_user_links_user_idx').on(table.userId),
  ],
);
export const supportSessions = pgTable(
  'support_sessions',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => supportGrants.id),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    staffSessionId: uuid('staff_session_id')
      .notNull()
      .references(() => staffSessions.id),
    handoffHash: bytea('handoff_hash').notNull(),
    tokenHash: bytea('token_hash'),
    handoffExpiresAt: timestamptz('handoff_expires_at').notNull(),
    consumedAt: timestamptz('consumed_at'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'support_sessions_grant_store_fk',
      columns: [table.storeId, table.grantId],
      foreignColumns: [supportGrants.storeId, supportGrants.id],
    }),
    uniqueIndex('support_sessions_handoff_key').on(table.handoffHash),
    uniqueIndex('support_sessions_token_key').on(table.tokenHash),
    index('support_sessions_store_idx').on(table.storeId),
    index('support_sessions_grant_idx').on(table.grantId),
    index('support_sessions_staff_idx').on(table.staffUserId),
    index('support_sessions_parent_idx').on(table.staffSessionId),
  ],
);
export const staffAuditExports = pgTable(
  'staff_audit_exports',
  {
    id: id(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    staffSessionId: uuid('staff_session_id')
      .notNull()
      .references(() => staffSessions.id),
    staffName: text('staff_name').notNull(),
    filter: jsonb('filter').notNull(),
    status: text('status', { enum: ['pending', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    progress: integer('progress').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    leaseId: uuid('lease_id'),
    leasedUntil: timestamptz('leased_until'),
    contents: text('contents'),
    error: text('error'),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('staff_audit_exports_staff_idx').on(table.staffUserId),
    index('staff_audit_exports_session_idx').on(table.staffSessionId),
    index('staff_audit_exports_pending_idx').on(table.status, table.leasedUntil),
    index('staff_audit_exports_expiry_idx').on(table.expiresAt),
  ],
);

// Global staff audit delivery state; shop notifications must never use staff IDs as users.
export const staffAlertDeliveries = pgTable(
  'staff_alert_deliveries',
  {
    auditId: uuid('audit_id')
      .primaryKey()
      .references(() => staffAuditLog.id),
    status: text('status', { enum: ['pending', 'delivered', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    leaseId: uuid('lease_id'),
    leasedUntil: timestamptz('leased_until'),
    nextAttemptAt: timestamptz('next_attempt_at').notNull().defaultNow(),
    error: text('error'),
    deliveredAt: timestamptz('delivered_at'),
  },
  (table) => [
    index('staff_alert_deliveries_pending_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'staff_alert_deliveries_status',
      sql`${table.status} in ('pending','delivered','failed')`,
    ),
    check('staff_alert_deliveries_attempts', sql`${table.attempts} between 0 and 5`),
  ],
);
