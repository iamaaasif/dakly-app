import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { KillSwitchFeature } from '@dakly/contracts/kill-switches';
import type { Database } from '@dakly/db/client';
import { killSwitches, staffAuditLog } from '@dakly/db/schema/admin';

import { DATABASE } from '../platform/database/database.tokens';
import type { Transaction } from '../platform/database/scoped-transactions';
import { StaffDatabase } from '../platform/database/staff-database';
import { TenantDatabase } from '../platform/database/tenant-database';
import { killSwitchError } from './kill-switches.errors';

export type KillSwitchRow = typeof killSwitches.$inferSelect;

export type KillSwitchChange = {
  id: string;
  staffUserId: string;
  feature: KillSwitchFeature;
  storeId: string | null;
  paused: boolean;
  reason: string;
  ip: string;
};

@Injectable()
export class KillSwitchesRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(StaffDatabase) private readonly staff: StaffDatabase,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}

  // The table has no row security: it is Dakly's own control data, read by every worker.
  list(): Promise<KillSwitchRow[]> {
    return this.database.select().from(killSwitches);
  }

  // A shop switch joins the caller's store transaction so the conflict check and the write are one unit.
  change(input: KillSwitchChange): Promise<KillSwitchRow | null> {
    const work = (tx: Transaction) => this.apply(tx, input);
    return input.storeId
      ? this.tenant.forStore(input.storeId, work)
      : this.staff.forStaff(input.staffUserId, work);
  }

  // The audit row goes in first (D28); a refused change throws and rolls it back with the rest.
  private async apply(tx: Transaction, input: KillSwitchChange): Promise<KillSwitchRow | null> {
    await tx.insert(staffAuditLog).values({
      id: input.id,
      staffUserId: input.staffUserId,
      action: input.paused ? 'kill_switch.paused' : 'kill_switch.resumed',
      storeId: input.storeId,
      targetType: 'kill_switch',
      targetId: input.id,
      reason: input.reason,
      actionDetails: { feature: input.feature },
      ip: input.ip,
    });
    const match = and(
      eq(killSwitches.feature, input.feature),
      input.storeId ? eq(killSwitches.storeId, input.storeId) : isNull(killSwitches.storeId),
    );
    const [existing] = await tx.select({ id: killSwitches.id }).from(killSwitches).where(match);
    if (input.paused) {
      if (existing) throw killSwitchError('KILL_SWITCH_ALREADY_PAUSED');
      const [row] = await tx
        .insert(killSwitches)
        .values({
          id: input.id,
          feature: input.feature,
          storeId: input.storeId,
          reason: input.reason,
          pausedByStaffId: input.staffUserId,
        })
        .returning();
      return row ?? null;
    }
    if (!existing) throw killSwitchError('KILL_SWITCH_NOT_PAUSED');
    await tx.delete(killSwitches).where(match);
    return null;
  }
}
