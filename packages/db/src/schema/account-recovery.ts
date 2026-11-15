import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth';
import { bytea, createdAt, id, timestamptz } from './columns';

export const accountRecoveries = pgTable(
  'account_recoveries',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialState: text('credential_state').notNull(),
    cancelHash: text('cancel_hash').notNull(),
    completionHash: text('completion_hash').notNull(),
    status: text('status').notNull().default('pending'),
    eligibleAt: timestamptz('eligible_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('account_recoveries_user_id_idx').on(table.userId),
    check(
      'account_recoveries_status',
      sql`${table.status} in ('pending', 'cancelled', 'completed')`,
    ),
  ],
);

export const accountSecurityNotices = pgTable(
  'account_security_notices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recoveryId: uuid('recovery_id').references(() => accountRecoveries.id, { onDelete: 'cascade' }),
    ciphertext: bytea('ciphertext').notNull(),
    keyVersion: smallint('key_version').notNull(),
    attempts: integer('attempts').notNull().default(0),
    retryAt: timestamptz('retry_at').notNull().defaultNow(),
    leaseId: uuid('lease_id'),
    leaseUntil: timestamptz('lease_until'),
    deliveredAt: timestamptz('delivered_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('account_security_notices_user_id_idx').on(table.userId),
    index('account_security_notices_recovery_id_idx').on(table.recoveryId),
    index('account_security_notices_due_idx')
      .on(table.retryAt)
      .where(sql`${table.deliveredAt} is null`),
  ],
);
