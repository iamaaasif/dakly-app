import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { staffAuditLog, staffAuditExports } from '@dakly/db/schema/admin';
import type { StaffAuditSearch, StaffAuditRow } from '@dakly/contracts/staff-audit';
import { DATABASE } from '../platform/database/database.tokens';
import { StaffDatabase } from '../platform/database/staff-database';
@Injectable()
export class StaffHistoryRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(StaffDatabase) private readonly scope: StaffDatabase,
  ) {}
  async search(filter: StaffAuditSearch, limit = 51) {
    const cursor = filter.cursor?.split('|');
    return (
      await this.database
        .execute<StaffAuditRow>(sql`select id,staff_user_id as "staffUserId",actor_user_id as "actorUserId",operator_identity as "operatorIdentity",action,store_id as "storeId",target_type as "targetType",target_id as "targetId",reason,action_details as "actionDetails",host(ip) as ip,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt" from staff_audit_log where true
   ${filter.action ? sql`and action=${filter.action}` : sql``}
   ${filter.staffUserId ? sql`and staff_user_id=${filter.staffUserId}::uuid` : sql``}
   ${filter.storeId ? sql`and store_id=${filter.storeId}::uuid` : sql``}
   ${filter.from ? sql`and created_at>=${filter.from}::timestamptz` : sql``}
   ${filter.to ? sql`and created_at<=${filter.to}::timestamptz` : sql``}
   ${cursor ? sql`and (created_at,id)<(${cursor[0]}::timestamptz,${cursor[1]}::uuid)` : sql``}
   order by created_at desc,id desc limit ${limit}`)
    ).rows;
  }
  async requestExport(
    staffUserId: string,
    sessionId: string,
    id: string,
    name: string,
    filter: StaffAuditSearch,
    reason: string,
    expiresAt: Date,
    ip: string,
  ) {
    await this.scope.inTransaction(staffUserId, async (tx) => {
      await tx.insert(staffAuditLog).values({
        staffUserId,
        action: 'staff.audit_export_requested',
        targetType: 'audit_export',
        targetId: id,
        reason,
        ip,
        actionDetails: { filter, maximumRows: 1000 },
      });
      await tx
        .insert(staffAuditExports)
        .values({ id, staffUserId, staffSessionId: sessionId, staffName: name, filter, expiresAt });
    });
  }
  async pending() {
    return (
      await this.database.execute<{ id: string }>(
        sql`select id from staff_audit_exports where status='pending' and expires_at>clock_timestamp() and (leased_until is null or leased_until<clock_timestamp()) order by created_at limit 20`,
      )
    ).rows;
  }
  async claim(id: string, leaseId: string) {
    return (
      await this.database.execute<{
        id: string;
        staffUserId: string;
        staffSessionId: string;
        staffName: string;
        filter: StaffAuditSearch;
      }>(
        sql`update staff_audit_exports set lease_id=${leaseId}::uuid,leased_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1,progress=10 where id=${id}::uuid and status='pending' and expires_at>clock_timestamp() and attempts<5 and (leased_until is null or leased_until<clock_timestamp()) returning id,staff_user_id as "staffUserId",staff_session_id as "staffSessionId",staff_name as "staffName",filter`,
      )
    ).rows[0];
  }
  async currentStaff(staffUserId: string, sessionId: string) {
    return (
      await this.database.execute<{ valid: boolean }>(
        sql`select exists(select 1 from staff_users u join staff_sessions s on s.staff_user_id=u.id where u.id=${staffUserId}::uuid and s.id=${sessionId}::uuid and u.status='active' and u.role='super_admin' and u.enrolled_at is not null and s.revoked_at is null and s.expires_at>clock_timestamp() and s.last_seen_at>clock_timestamp()-interval '30 minutes') as valid`,
      )
    ).rows[0]!.valid;
  }
  async finish(id: string, leaseId: string, contents: string | null, error: string | null) {
    await this.database.execute(
      sql`update staff_audit_exports set contents=${contents},error=${error},status=${error ? 'failed' : 'ready'},progress=100,leased_until=null where id=${id}::uuid and lease_id=${leaseId}::uuid and leased_until>clock_timestamp() and status='pending' and expires_at>clock_timestamp()`,
    );
  }
  async release(id: string, leaseId: string) {
    await this.database.execute(
      sql`update staff_audit_exports set leased_until=null where id=${id}::uuid and lease_id=${leaseId}::uuid and status='pending'`,
    );
  }
  async get(staffUserId: string, id: string) {
    return (
      await this.database.execute<{
        id: string;
        staffSessionId: string;
        status: 'pending' | 'ready' | 'failed';
        progress: number;
        expiresAt: string;
        error: string | null;
        contents: string | null;
      }>(
        sql`select id,staff_session_id as "staffSessionId",status,progress,expires_at::text as "expiresAt",error,contents from staff_audit_exports where id=${id}::uuid and staff_user_id=${staffUserId}::uuid and expires_at>clock_timestamp()`,
      )
    ).rows[0];
  }
  async downloadAudit(staffUserId: string, id: string, ip: string) {
    await this.scope.inTransaction(staffUserId, (tx) =>
      tx.insert(staffAuditLog).values({
        staffUserId,
        action: 'staff.audit_export_downloaded',
        targetType: 'audit_export',
        targetId: id,
        reason: 'Staff downloaded their audit export',
        ip,
      }),
    );
  }
  async maintain() {
    await this.database.execute(
      sql`delete from staff_audit_exports where id in (select id from staff_audit_exports where expires_at<=clock_timestamp() order by expires_at limit 100)`,
    );
    await this.database.execute(
      sql`update staff_audit_exports set status='failed',error='Export failed after five attempts',progress=100 where id in (select id from staff_audit_exports where status='pending' and attempts>=5 and (leased_until is null or leased_until<clock_timestamp()) limit 100)`,
    );
  }
  async seal() {
    return (
      await this.database.execute<{ day: string | null }>(
        sql`select seal_staff_audit_day()::text as day`,
      )
    ).rows[0]!.day;
  }
  async verify(from: string) {
    return (
      await this.database.execute<{ day: string; valid: boolean }>(
        sql`select d.day::text as day,(d.hash=h.hash and d.row_count=h.row_count and d.previous_hash is not distinct from p.hash) as valid from staff_audit_log_days d left join staff_audit_log_days p on p.day=d.day-1 cross join lateral staff_audit_day_hash(d.day,d.previous_hash) h where d.day>=${from}::date and d.day<${from}::date+31 order by d.day`,
      )
    ).rows;
  }
}
