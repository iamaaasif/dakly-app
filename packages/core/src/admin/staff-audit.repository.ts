import { Inject, Injectable } from '@nestjs/common';
import { staffAuditLog } from '@dakly/db/schema/admin';
import { StaffDatabase } from '../platform/database/staff-database';
@Injectable()
export class StaffAuditRepository {
  constructor(@Inject(StaffDatabase) private readonly scope: StaffDatabase) {}
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
