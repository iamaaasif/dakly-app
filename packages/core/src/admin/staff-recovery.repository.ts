import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { accountRecoveryReasons } from '@dakly/contracts/account-security-events';
import type { StoreRecoveryHistory } from '@dakly/contracts/staff-recovery';
import { staffSessions, staffUsers, staffAuditLog } from '@dakly/db/schema/admin';
import { staffRecoveryHistory } from '@dakly/db/schema/staff-recovery';

import { AccountDatabase } from '../platform/database/account-database';
import { TenantDatabase } from '../platform/database/tenant-database';

export type RecoveryStores = {
  overflow: boolean;
  stores: string[];
  owners: { userId: string; phone: string | null; email: string | null }[];
};
@Injectable()
export class StaffRecoveryRepository {
  constructor(
    @Inject(AccountDatabase) private readonly account: AccountDatabase,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}
  async stores(userId: string): Promise<RecoveryStores> {
    return this.account.inTransaction(
      userId,
      async (tx) =>
        (
          await tx.execute<{ snapshot: RecoveryStores }>(
            sql`select staff_recovery_stores(${userId}::uuid) as snapshot`,
          )
        ).rows[0]!.snapshot,
    );
  }
  async staff(userId: string, staffUserId: string, sessionId: string) {
    return this.account.inTransaction(userId, async (tx) => {
      const [staff] = await tx
        .select({
          role: staffUsers.role,
          status: staffUsers.status,
          enrolledAt: staffUsers.enrolledAt,
        })
        .from(staffUsers)
        .where(eq(staffUsers.id, staffUserId))
        .for('update');
      const [session] = await tx
        .select({
          revokedAt: staffSessions.revokedAt,
          expiresAt: staffSessions.expiresAt,
          lastSeenAt: staffSessions.lastSeenAt,
        })
        .from(staffSessions)
        .where(and(eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.id, sessionId)))
        .for('update');
      return { staff, session };
    });
  }
  async used(userId: string, actionId: string) {
    return this.account.inTransaction(
      userId,
      async (tx) =>
        (
          await tx
            .select({ id: staffAuditLog.id })
            .from(staffAuditLog)
            .where(eq(staffAuditLog.id, actionId))
            .limit(1)
        ).length > 0,
    );
  }
  async recordHistory(userId: string, auditId: string, stores: string[]) {
    await this.account.inTransaction(userId, (tx) =>
      tx.execute(
        sql`select record_staff_recovery_history(${auditId}::uuid,${sql.param(stores)}::uuid[])`,
      ),
    );
  }
  history(storeId: string, before?: string) {
    return this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          id: staffRecoveryHistory.auditId,
          userId: sql<string>`${staffAuditLog.targetId}`,
          reasonType: sql<
            StoreRecoveryHistory['items'][number]['reasonType']
          >`${staffAuditLog.actionDetails}->>'reasonType'`,
          createdAt: staffAuditLog.createdAt,
        })
        .from(staffRecoveryHistory)
        .innerJoin(staffAuditLog, eq(staffAuditLog.id, staffRecoveryHistory.auditId))
        .where(
          and(
            eq(staffRecoveryHistory.storeId, storeId),
            eq(staffAuditLog.action, 'account.recovered'),
            eq(staffAuditLog.targetType, 'user'),
            isNotNull(staffAuditLog.targetId),
            inArray(
              sql<string>`${staffAuditLog.actionDetails}->>'reasonType'`,
              accountRecoveryReasons,
            ),
            before ? lt(staffRecoveryHistory.auditId, before) : undefined,
          ),
        )
        .orderBy(desc(staffRecoveryHistory.auditId))
        .limit(51),
    );
  }
}
