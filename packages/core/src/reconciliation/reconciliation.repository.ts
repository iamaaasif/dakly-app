import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import type { SettlementLineActionInput } from '@dakly/contracts/admin-reconciliation';
import type { Database } from '@dakly/db/client';
import { staffAuditLog } from '@dakly/db/schema/admin';
import { gatewaySettlementLines as lines } from '@dakly/db/schema/payments';

import { DATABASE } from '../platform/database/database.tokens';
import { StaffDatabase } from '../platform/database/staff-database';
import { reconciliationError } from './reconciliation.errors';

export type SettlementLine = typeof lines.$inferSelect;
const openStatuses = ['unmatched', 'escalated'] as const;

@Injectable()
export class ReconciliationRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(StaffDatabase) private readonly staff: StaffDatabase,
  ) {}

  // Settlement lines hold Dakly's own gateway money, not shop data, so they have no row security.
  openLines(limit: number): Promise<SettlementLine[]> {
    return this.database
      .select()
      .from(lines)
      .where(inArray(lines.status, [...openStatuses]))
      .orderBy(asc(lines.settlementDate), asc(lines.id))
      .limit(limit);
  }

  // The audit row goes in first (D28); a line that is no longer open rolls it back.
  close(input: {
    auditId: string;
    staffUserId: string;
    lineId: string;
    change: SettlementLineActionInput;
    ip: string;
    now: Date;
  }): Promise<SettlementLine> {
    return this.staff.forStaff(input.staffUserId, async (tx) => {
      const [line] = await tx.select().from(lines).where(eq(lines.id, input.lineId)).for('update');
      if (!line) throw reconciliationError('SETTLEMENT_LINE_NOT_FOUND');
      if (!openStatuses.some((status) => status === line.status))
        throw reconciliationError('SETTLEMENT_LINE_NOT_OPEN');
      await tx.insert(staffAuditLog).values({
        id: input.auditId,
        staffUserId: input.staffUserId,
        action: `settlement_line.${input.change.action}`,
        targetType: 'settlement_line',
        targetId: line.id,
        reason: input.change.reason,
        actionDetails: { gateway: line.gateway, gatewayTransactionId: line.gatewayTransactionId },
        ip: input.ip,
      });
      const [updated] = await tx
        .update(lines)
        .set({
          status: input.change.action,
          note: input.change.reason,
          matchedByStaffId: input.staffUserId,
          matchedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(lines.id, line.id))
        .returning();
      if (!updated) throw reconciliationError('SETTLEMENT_LINE_NOT_FOUND');
      return updated;
    });
  }
}
