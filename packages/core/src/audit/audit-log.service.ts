import { Inject, Injectable } from '@nestjs/common';

import type { AuditLogItem, AuditLogPage, AuditLogQuery } from '@dakly/contracts/audit';

import { TeamService } from '../team/team.service';
import { auditLogError } from './audit-log.errors';
import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditLogService {
  constructor(
    @Inject(AuditRepository) private readonly repository: AuditRepository,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  async list(storeId: string, userId: string, query: AuditLogQuery): Promise<AuditLogPage> {
    const access = await this.team.accessFor(storeId, userId);
    if (!access || access.role !== 'owner') throw auditLogError('AUDIT_LOG_DENIED');
    // One extra row tells whether another page exists.
    const rows = await this.repository.list(storeId, {
      before: query.before,
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const items: AuditLogItem[] = page.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: { kind: row.actorType, isYou: row.actorUserId === userId, role: row.actorRole },
      changedFields: changedFields(row.after),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
    return { items, nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null };
  }
}

function changedFields(after: unknown): string[] {
  if (typeof after !== 'object' || after === null || !('changedFields' in after)) return [];
  const fields = after.changedFields;
  return Array.isArray(fields) ? fields.filter((field) => typeof field === 'string') : [];
}
