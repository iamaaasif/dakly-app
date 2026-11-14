import { Inject, Injectable } from '@nestjs/common';
import { StaffAuditRepository } from './staff-audit.repository';
@Injectable()
export class StaffAuditService {
  constructor(@Inject(StaffAuditRepository) private readonly repository: StaffAuditRepository) {}
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
