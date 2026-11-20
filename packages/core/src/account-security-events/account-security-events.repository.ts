import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import type {
  AccountSecurityEvent,
  AccountSecurityHistory,
} from '@dakly/contracts/account-security-events';
import type { Database } from '@dakly/db/client';
import { accountSecurityEvents } from '@dakly/db/schema/account-security-events';

import { AccountDatabase } from '../platform/database/account-database';
import { DATABASE } from '../platform/database/database.tokens';

const historyColumns = {
  id: accountSecurityEvents.id,
  event: accountSecurityEvents.event,
  actorType: accountSecurityEvents.actorType,
  actorStaffId: accountSecurityEvents.actorStaffId,
  reasonType: accountSecurityEvents.reasonType,
  ip: accountSecurityEvents.ip,
  userAgent: accountSecurityEvents.userAgent,
  details: accountSecurityEvents.details,
  createdAt: accountSecurityEvents.createdAt,
};

@Injectable()
export class AccountSecurityEventsRepository {
  constructor(
    @Inject(AccountDatabase) private readonly database: AccountDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // The SQL function deletes only rows older than two years, one short transaction per call.
  async purgeExpiredBatch(limit: number): Promise<number> {
    const { rows } = await this.global.execute<{ deleted: number }>(
      sql`select public.purge_account_security_events(${limit}) as deleted`,
    );
    return rows[0]?.deleted ?? 0;
  }

  async insert(userId: string, entry: AccountSecurityEvent): Promise<void> {
    await this.database.inTransaction(userId, (tx) =>
      tx.insert(accountSecurityEvents).values({
        userId,
        event: entry.event,
        actorType: entry.actor.kind,
        actorStaffId: entry.actor.kind === 'staff' ? entry.actor.staffId : null,
        reasonType: entry.actor.kind === 'staff' ? entry.actor.reasonType : null,
        ip: entry.ip,
        userAgent: entry.userAgent,
        details: entry.details,
      }),
    );
  }

  list(userId: string, page: AccountSecurityHistory) {
    return this.database.forUser(userId, (tx) =>
      tx
        .select(historyColumns)
        .from(accountSecurityEvents)
        .where(
          and(
            eq(accountSecurityEvents.userId, userId),
            page.before ? lt(accountSecurityEvents.id, page.before) : undefined,
          ),
        )
        .orderBy(desc(accountSecurityEvents.id))
        .limit(page.limit),
    );
  }
}
