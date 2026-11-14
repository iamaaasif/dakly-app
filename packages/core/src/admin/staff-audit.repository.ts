import { Inject, Injectable } from '@nestjs/common';
import { staffAuditLog } from '@dakly/db/schema/admin';
import { TenantDatabase } from '../platform/database/tenant-database';
import type { TenantStaffAudit } from '@dakly/contracts/staff-audit';
import { StaffDatabase } from '../platform/database/staff-database';
@Injectable()
export class StaffAuditRepository {
  constructor(
    @Inject(StaffDatabase) private readonly scope: StaffDatabase,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}
  async recordForStore(storeId: string, entry: TenantStaffAudit): Promise<void> {
    const { actor, ...values } = entry;
    await this.tenant.inTransaction(storeId, (tx) =>
      tx.insert(staffAuditLog).values({
        storeId,
        ...values,
        staffUserId: actor.kind === 'staff' ? actor.staffUserId : null,
        actorUserId: actor.kind === 'user' ? actor.userId : null,
      }),
    );
  }
  async provisioned(
    staffUserId: string,
    operatorIdentity: string,
    reason: string,
    reissued: boolean,
  ): Promise<void> {
    await this.scope.inTransaction(staffUserId, (tx) =>
      tx.insert(staffAuditLog).values({
        operatorIdentity,
        staffUserId: null,
        action: reissued ? 'staff.enrollment_reissued' : 'staff.provisioned',
        targetType: 'staff',
        targetId: staffUserId,
        reason,
        actionDetails: { source: 'privileged_operator_attestation' },
      }),
    );
  }
  async record(staffUserId: string, action: string, ip: string): Promise<void> {
    await this.scope.inTransaction(staffUserId, (tx) =>
      tx.insert(staffAuditLog).values({
        staffUserId,
        action,
        ip,
        targetType: 'staff',
        targetId: staffUserId,
        reason: 'Staff authentication requested',
      }),
    );
  }
}
