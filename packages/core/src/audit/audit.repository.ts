import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import type { AuditEntry, AuditHistoryQuery } from '@dakly/contracts/audit';
import { auditLog } from '@dakly/db/schema/platform';
import { memberships } from '@dakly/db/schema/team';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class AuditRepository {
  constructor(private readonly database: TenantDatabase) {}

  history(storeId: string, { entityType, entityId, action }: AuditHistoryQuery) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: auditLog.id,
          before: auditLog.before,
          after: auditLog.after,
          actorType: auditLog.actorType,
          actorUserId: auditLog.actorUserId,
          actorStaffId: auditLog.actorStaffId,
          reason: auditLog.reason,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.storeId, storeId),
            eq(auditLog.entityType, entityType),
            eq(auditLog.entityId, entityId),
            eq(auditLog.action, action),
          ),
        )
        .orderBy(auditLog.createdAt, auditLog.id),
    );
  }

  // Newest first. UUID v7 ids sort by time, so the id is the cursor.
  list(storeId: string, { before, limit }: { before?: string; limit: number }) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          after: auditLog.after,
          actorType: auditLog.actorType,
          actorUserId: auditLog.actorUserId,
          actorRole: memberships.builtInRole,
          reason: auditLog.reason,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(
          memberships,
          and(
            eq(memberships.storeId, auditLog.storeId),
            eq(memberships.userId, auditLog.actorUserId),
          ),
        )
        .where(and(eq(auditLog.storeId, storeId), before ? lt(auditLog.id, before) : undefined))
        .orderBy(desc(auditLog.id))
        .limit(limit),
    );
  }

  async insert(storeId: string, entry: AuditEntry): Promise<void> {
    await this.database.inTransaction(storeId, (tx) =>
      tx.insert(auditLog).values({
        storeId,
        actorType: entry.actor.kind,
        actorUserId: entry.actor.kind === 'user' ? entry.actor.userId : null,
        actorStaffId: entry.actor.kind === 'staff' ? entry.actor.staffUserId : null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        ip: entry.ip,
        reason: entry.reason,
        // A transaction can begin before it acquires the row lock for the change.
        createdAt: sql`statement_timestamp()`,
      }),
    );
  }
}
