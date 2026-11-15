import { Inject, Injectable } from '@nestjs/common';

import type { TenantStaffAudit } from '@dakly/contracts/staff-audit';

import { StaffAuditRepository } from './staff-audit.repository';

@Injectable()
export class StaffAuditService {
  constructor(@Inject(StaffAuditRepository) private readonly repository: StaffAuditRepository) {}
  recordForAccount(userId: string, id: string, entry: TenantStaffAudit) {
    return this.repository.recordForAccount(userId, id, entry);
  }

  recordForStore(storeId: string, entry: TenantStaffAudit): Promise<string> {
    return this.repository.recordForStore(storeId, entry);
  }

  provisioned(
    staffUserId: string,
    operatorIdentity: string,
    reason: string,
    reissued: boolean,
  ): Promise<void> {
    return this.repository.provisioned(staffUserId, operatorIdentity, reason, reissued);
  }

  record(
    staffUserId: string,
    action:
      | 'staff.authentication_failed'
      | 'staff.enrollment_started'
      | 'staff.enrolled_totp'
      | 'staff.enrolled_passkey'
      | 'staff.signed_in'
      | 'staff.signed_out',
    ip: string,
  ): Promise<void> {
    return this.repository.record(staffUserId, action, ip);
  }
}
