import { Inject, Injectable } from '@nestjs/common';

import type {
  ChangeKillSwitchInput,
  KillSwitchChangeResponse,
  KillSwitchFeature,
  KillSwitchListResponse,
} from '@dakly/contracts/kill-switches';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { KillSwitchesService } from '../kill-switches/kill-switches.service';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { supportError } from './support.errors';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';

type Staff = StaffIdentity & { sessionId: string };

// Pausing AI replies, campaign sending or social posting is a risky action (D28): one staff
// member, a reason, and the audit row written first, in the same transaction as the change.
@Injectable()
export class KillSwitchAdminService {
  constructor(
    @Inject(KillSwitchesService) private readonly switches: KillSwitchesService,
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(SupportService) private readonly support: SupportService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async list(): Promise<KillSwitchListResponse> {
    const rows = await this.switches.listActive();
    return {
      switches: rows.map((row) => ({
        id: row.id,
        feature: row.feature,
        storeId: row.storeId,
        reason: row.reason,
        pausedByStaffId: row.pausedByStaffId,
        pausedAt: row.createdAt.toISOString(),
      })),
    };
  }

  async change({
    staff,
    feature,
    storeId,
    input,
    ip,
  }: {
    staff: Staff;
    feature: KillSwitchFeature;
    storeId: string | null;
    input: ChangeKillSwitchInput;
    ip: string;
  }): Promise<KillSwitchChangeResponse> {
    const change = {
      id: newId(),
      staffUserId: staff.id,
      feature,
      storeId,
      paused: input.paused,
      reason: input.reason,
      ip,
    };
    if (storeId) {
      if (!(await this.repository.targets(storeId))[0]) throw supportError('STORE_NOT_FOUND');
      await this.transaction.run(storeId, async () => {
        await this.support.authorizeKillSwitch(storeId, staff);
        await this.switches.change(change);
      });
    } else {
      await this.switches.change(change);
    }
    return { feature, storeId, paused: input.paused };
  }
}
