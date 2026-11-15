import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import {
  accountRecoveryReasons,
  accountSecurityActorTypes,
  accountSecurityEventTypes,
} from '@dakly/contracts/account-security-events';

import { staffUsers } from './admin';
import { users } from './auth';
import { createdAt, id, inet, isOneOf } from './columns';

export const accountSecurityEvents = pgTable(
  'account_security_events',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    event: text('event', { enum: accountSecurityEventTypes }).notNull(),
    actorType: text('actor_type', { enum: accountSecurityActorTypes }).notNull(),
    actorStaffId: uuid('actor_staff_id').references(() => staffUsers.id),
    reasonType: text('reason_type', { enum: accountRecoveryReasons }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    details: jsonb('details')
      .$type<{ sessionId?: string; recoveryId?: string }>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index('account_security_events_user_id_id_idx').on(table.userId, table.id),
    index('account_security_events_created_at_idx').on(table.createdAt),
    index('account_security_events_actor_staff_id_idx').on(table.actorStaffId),
    check('account_security_events_event', isOneOf(table.event, accountSecurityEventTypes)),
    check('account_security_events_actor', isOneOf(table.actorType, accountSecurityActorTypes)),
    check('account_security_events_reason', isOneOf(table.reasonType, accountRecoveryReasons)),
    check(
      'account_security_events_staff',
      sql`(${table.actorType} = 'staff' and ${table.actorStaffId} is not null and ${table.reasonType} is not null) or (${table.actorType} <> 'staff' and ${table.actorStaffId} is null and ${table.reasonType} is null)`,
    ),
    check('account_security_events_user_agent', sql`char_length(${table.userAgent}) <= 512`),
    check(
      'account_security_events_details',
      sql`jsonb_typeof(${table.details}) = 'object' and (${table.details} - 'sessionId' - 'recoveryId') = '{}'::jsonb and (not (${table.details} ? 'sessionId') or coalesce((${table.details}->>'sessionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', false)) and (not (${table.details} ? 'recoveryId') or coalesce((${table.details}->>'recoveryId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', false))`,
    ),
  ],
);
