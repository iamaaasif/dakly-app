import { Injectable } from '@nestjs/common';
import type { AuditEntry } from '@dakly/contracts/audit';
import { auditLog } from '@dakly/db/schema/platform';
import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class AuditRepository {
  constructor(private readonly database: TenantDatabase) {}
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
      }),
    );
  }
}
