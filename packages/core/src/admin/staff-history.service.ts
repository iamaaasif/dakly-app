import { Inject, Injectable } from '@nestjs/common';

import type { StaffAuditSearch, StaffAuditPage, StaffAuditRow } from '@dakly/contracts/staff-audit';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { StaffHistoryRepository } from './staff-history.repository';
import { supportError } from './support.errors';

@Injectable()
export class StaffHistoryService {
  constructor(
    @Inject(StaffHistoryRepository) private readonly repository: StaffHistoryRepository,
    @Inject(StaffTransaction) private readonly transaction: StaffTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  async search(
    staff: StaffIdentity & { sessionId: string },
    filter: StaffAuditSearch,
  ): Promise<StaffAuditPage> {
    await this.assertStaff(staff);
    const rows = await this.repository.search(filter);
    const more = rows.length > 50;
    const page = rows.slice(0, 50);
    const last = page.at(-1);
    return { rows: page, cursor: more && last ? `${last.createdAt}|${last.id}` : null };
  }
  async request(
    staff: StaffIdentity & { sessionId: string },
    filter: StaffAuditSearch,
    reason: string,
    ip: string,
  ) {
    await this.assertStaff(staff);
    const id = newId();
    await this.transaction.run(staff.id, () =>
      this.repository.requestExport(
        staff.id,
        staff.sessionId,
        id,
        staff.name,
        filter,
        reason,
        new Date(this.clock.now().getTime() + 86400000),
        ip,
      ),
    );
    return { id };
  }
  pending() {
    return this.repository.pending();
  }
  async build(id: string) {
    const leaseId = newId();
    const task = await this.repository.claim(id, leaseId);
    if (!task) return;
    try {
      if (!(await this.repository.currentStaff(task.staffUserId, task.staffSessionId))) {
        await this.repository.finish(id, leaseId, null, 'Staff authorization ended');
        return;
      }
      const rows = await this.repository.search(task.filter, 1001);
      if (rows.length > 1000) {
        await this.repository.finish(
          id,
          leaseId,
          null,
          'More than 1,000 rows match. Narrow the filters and request another export.',
        );
        return;
      }
      const contents = exportCsv(task.staffName, rows);
      if (!(await this.repository.currentStaff(task.staffUserId, task.staffSessionId))) {
        await this.repository.finish(id, leaseId, null, 'Staff authorization ended');
        return;
      }
      await this.repository.finish(id, leaseId, contents, null);
    } catch (error) {
      await this.repository.release(id, leaseId);
      throw error;
    }
  }
  async get(staff: StaffIdentity & { sessionId: string }, id: string) {
    const result = await this.authorized(staff, id);
    return {
      id: result.id,
      status: result.status,
      progress: result.progress,
      expiresAt: result.expiresAt,
      error: result.error,
    };
  }
  async download(staff: StaffIdentity & { sessionId: string }, id: string, ip: string) {
    const result = await this.authorized(staff, id);
    if (result.status !== 'ready' || !result.contents)
      throw supportError('AUDIT_EXPORT_UNAVAILABLE');
    await this.transaction.run(staff.id, () => this.repository.downloadAudit(staff.id, id, ip));
    return result.contents;
  }
  private async authorized(staff: StaffIdentity & { sessionId: string }, id: string) {
    await this.assertStaff(staff);
    const result = await this.repository.get(staff.id, id);
    if (!result || !(await this.repository.currentStaff(staff.id, result.staffSessionId)))
      throw supportError('AUDIT_EXPORT_UNAVAILABLE');
    return result;
  }
  async maintain() {
    await this.repository.maintain();
    for (let days = 0; days < 7; days++) if (!(await this.repository.seal())) break;
  }
  async verify(staff: StaffIdentity & { sessionId: string }, from: string) {
    await this.assertStaff(staff);
    return this.repository.verify(from);
  }
  private async assertStaff(staff: StaffIdentity & { sessionId: string }) {
    if (
      staff.role !== 'super_admin' ||
      !(await this.repository.currentStaff(staff.id, staff.sessionId))
    )
      throw supportError('SUPPORT_DENIED');
  }
}
function csv(value: unknown) {
  const raw = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  const safe = /^[\t\r\n ]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(staffName: string, rows: StaffAuditRow[]) {
  const columns: (keyof StaffAuditRow)[] = [
    'id',
    'createdAt',
    'staffUserId',
    'actorUserId',
    'operatorIdentity',
    'action',
    'storeId',
    'targetType',
    'targetId',
    'reason',
    'actionDetails',
    'ip',
  ];
  return [
    [csv('Exported by'), csv(staffName)].join(','),
    columns.map(csv).join(','),
    ...rows.map((row) => columns.map((key) => csv(row[key])).join(',')),
  ].join('\r\n');
}
