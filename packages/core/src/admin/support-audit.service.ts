import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';

import { AuditService } from '../audit/audit.service';
import { StaffAuditService } from './staff-audit.service';

type SupportAuditEntry = {
  id: string;
  actor: { kind: 'staff'; staffUserId: string } | { kind: 'user'; userId: string };
  action: string;
  reason: string;
  ip: string;
  details?: Record<string, unknown>;
  entityType?: string;
  after?: AuditEntry['after'];
};

@Injectable()
export class SupportAuditService {
  constructor(
    @Inject(StaffAuditService) private readonly staffAudit: StaffAuditService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async record(
    storeId: string,
    {
      id,
      actor,
      action,
      reason,
      ip,
      details,
      entityType = 'support_grant',
      after,
    }: SupportAuditEntry,
  ) {
    const auditId = await this.staffAudit.recordForStore(storeId, {
      actor,
      action,
      targetType: entityType,
      targetId: id,
      reason,
      ip,
      actionDetails: details,
    });
    await this.audit.record(storeId, { actor, action, entityType, entityId: id, ip, after });
    return auditId;
  }
}
