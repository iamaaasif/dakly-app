import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { StaffAlert } from '@dakly/contracts/break-glass';
import type { Database } from '@dakly/db/client';
import {
  staffAlertDeliveries,
  staffAuditLog,
  staffUsers,
  staffSessions,
} from '@dakly/db/schema/admin';

import { DATABASE } from '../platform/database/database.tokens';
import { StaffDatabase } from '../platform/database/staff-database';
import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class StaffAlertsRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(StaffDatabase) private readonly staff: StaffDatabase,
  ) {}

  async recordIntent(storeId: string, auditId: string, now: Date) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx.insert(staffAlertDeliveries).values({ auditId, nextAttemptAt: now }),
    );
  }

  async currentStaff(staffUserId: string, sessionId: string) {
    return this.staff.inTransaction(staffUserId, async (tx) => {
      const [staff] = await tx
        .select({
          role: staffUsers.role,
          status: staffUsers.status,
          enrolledAt: staffUsers.enrolledAt,
        })
        .from(staffUsers)
        .where(eq(staffUsers.id, staffUserId))
        .for('share');
      const [session] = await tx
        .select({
          revokedAt: staffSessions.revokedAt,
          expiresAt: staffSessions.expiresAt,
          lastSeenAt: staffSessions.lastSeenAt,
        })
        .from(staffSessions)
        .where(and(eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.id, sessionId)))
        .for('share');
      return { staff, session };
    });
  }

  async list(staffUserId: string, before?: string) {
    return this.staff.inTransaction(
      staffUserId,
      async (tx) =>
        (
          await tx.execute<StaffAlert>(sql`
            select
              a.id,
              u.name as "staffName",
              a.store_id as "storeId",
              a.reason,
              to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
              d.status,
              d.attempts,
              d.error
            from staff_audit_log a
            join staff_alert_deliveries d on d.audit_id=a.id
            join staff_users u on u.id=a.staff_user_id
            where a.action='support.break_glass_opened'
              ${before ? sql`and (a.created_at, a.id)<(select created_at, id from staff_audit_log where id=${before}::uuid)` : sql``}
            order by a.created_at desc, a.id desc
            limit 51`)
        ).rows,
    );
  }

  async lockDelivery(staffUserId: string, auditId: string) {
    return this.staff.inTransaction(staffUserId, async (tx) => {
      const [delivery] = await tx
        .select({
          status: staffAlertDeliveries.status,
          nextAttemptAt: staffAlertDeliveries.nextAttemptAt,
        })
        .from(staffAlertDeliveries)
        .where(eq(staffAlertDeliveries.auditId, auditId))
        .for('update');
      return delivery;
    });
  }

  async retry(staffUserId: string, auditId: string, reason: string, ip: string, now: Date) {
    await this.staff.inTransaction(staffUserId, async (tx) => {
      await tx.insert(staffAuditLog).values({
        staffUserId,
        action: 'staff.alert_retry_requested',
        targetType: 'staff_alert',
        targetId: auditId,
        reason,
        ip,
      });
      await tx
        .update(staffAlertDeliveries)
        .set({
          status: 'pending',
          attempts: 0,
          leaseId: null,
          leasedUntil: null,
          nextAttemptAt: now,
          error: null,
        })
        .where(eq(staffAlertDeliveries.auditId, auditId));
    });
  }

  async pending(now: Date) {
    await this.database.execute(sql`
      update staff_alert_deliveries
      set
        status='failed',
        error='Delivery stopped after five attempts. Repair Slack configuration, then retry.'
      where audit_id in (
        select audit_id
        from staff_alert_deliveries
        where status='pending'
          and attempts>=5
          and (leased_until is null or leased_until<=${now})
        order by next_attempt_at
        limit 100
      )`);
    return (
      await this.database.execute<{
        id: string;
      }>(sql`
        select audit_id as id
        from staff_alert_deliveries
        where status='pending'
          and attempts<5
          and next_attempt_at<=${now}
          and (leased_until is null or leased_until<=${now})
        order by next_attempt_at
        limit 20`)
    ).rows;
  }

  async claim(id: string, leaseId: string, now: Date) {
    return (
      await this.database.execute<{ attempts: number }>(sql`
        update staff_alert_deliveries
        set
          lease_id=${leaseId}::uuid,
          leased_until=${new Date(now.getTime() + 60000)},
          attempts=attempts+1
        where audit_id=${id}::uuid
          and status='pending'
          and attempts<5
          and next_attempt_at<=${now}
          and (leased_until is null or leased_until<=${now})
        returning attempts`)
    ).rows[0];
  }

  async event(id: string) {
    return (
      await this.database.execute<{
        staffUserId: string;
        storeId: string;
        actionDetails: unknown;
      }>(sql`
        select
          staff_user_id as "staffUserId",
          store_id as "storeId",
          action_details as "actionDetails"
        from staff_audit_log
        where id=${id}::uuid
          and action='support.break_glass_opened'`)
    ).rows[0];
  }

  async finish(
    id: string,
    leaseId: string,
    status: 'pending' | 'failed' | 'delivered',
    error: string | null,
    nextAttemptAt: Date,
    now: Date,
  ) {
    await this.database.execute(sql`
      update staff_alert_deliveries
      set
        status=${status},
        error=${error},
        delivered_at=${status === 'delivered' ? now : null},
        next_attempt_at=${nextAttemptAt},
        lease_id=null,
        leased_until=null
      where audit_id=${id}::uuid
        and lease_id=${leaseId}::uuid
        and leased_until>${now}
        and status='pending'`);
  }
}
