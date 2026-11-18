import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { AuditEntry } from '@dakly/contracts/audit';
import { auditLog } from '@dakly/db/schema/platform';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class AuditRepository {
  constructor(private readonly database: TenantDatabase) {}

  orderStages(storeId: string, orderId: string) {
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
            eq(auditLog.entityType, 'order'),
            eq(auditLog.entityId, orderId),
            eq(auditLog.action, 'order.stage_changed'),
          ),
        )
        .orderBy(auditLog.createdAt, auditLog.id),
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
        createdAt: entry.occurredAt ? new Date(entry.occurredAt) : undefined,
      }),
    );
  }
}
