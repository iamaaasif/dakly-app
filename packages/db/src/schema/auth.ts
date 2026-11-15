import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { languages } from '@dakly/contracts/stores';

import { bytea, citext, createdAt, id, inet, isOneOf, timestamptz, updatedAt } from './columns';
import { stores } from './stores';

// A person who signs in. Global: one user can belong to many stores through memberships.
// Sign-in codes and lockout counters live in Valkey with a TTL, not here.
export const users = pgTable(
  'users',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone'),
    phoneVerifiedAt: timestamptz('phone_verified_at'),
    email: citext('email'),
    emailVerifiedAt: timestamptz('email_verified_at'),
    passwordHash: text('password_hash'),
    // Google's stable subject id. After the first link, Google is never matched by email again.
    googleSubject: text('google_subject'),
    totpSecretCiphertext: bytea('totp_secret_ciphertext'),
    totpKeyVersion: smallint('totp_key_version'),
    totpEnabledAt: timestamptz('totp_enabled_at'),
    totpLastStep: integer('totp_last_step'),
    securityVersion: integer('security_version').notNull().default(0),
    backupCodeHashes: text('backup_code_hashes').array(),
    language: text('language', { enum: languages }).notNull().default('en'),
    isDisabled: boolean('is_disabled').notNull().default(false),
    lastSignInAt: timestamptz('last_sign_in_at'),
    // The terms and privacy version the user accepted at sign-up or after a change.
    termsVersion: text('terms_version'),
    termsAcceptedAt: timestamptz('terms_accepted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('users_phone_key').on(table.phone),
    uniqueIndex('users_email_key')
      .on(table.email)
      .where(sql`${table.emailVerifiedAt} is not null`),
    index('users_unverified_email_idx')
      .on(table.email)
      .where(sql`${table.emailVerifiedAt} is null`),
    uniqueIndex('users_google_subject_key').on(table.googleSubject),
    check('users_has_identifier', sql`${table.phone} is not null or ${table.email} is not null`),
    check('users_phone_format', sql`${table.phone} ~ '^01[3-9][0-9]{8}$'`),
    check('users_language', isOneOf(table.language, languages)),
    check('users_terms', sql`(${table.termsVersion} is null) = (${table.termsAcceptedAt} is null)`),
    check('users_name_length', sql`char_length(${table.name}) between 1 and 120`),
  ],
);

// Opaque session tokens; only the SHA-256 hash is stored, so a database leak cannot sign anyone in.
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: bytea('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeStoreId: uuid('active_store_id').references(() => stores.id),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    isRemembered: boolean('is_remembered').notNull().default(false),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_active_store_id_idx').on(table.activeStoreId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

// Web push endpoints for staff devices; a notification row says which store it is about.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    // Last push the browser accepted; subscriptions silent for 60 days are removed.
    lastSuccessfulPushAt: timestamptz('last_successful_push_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_key').on(table.endpoint),
    index('push_subscriptions_user_id_idx').on(table.userId),
  ],
);
