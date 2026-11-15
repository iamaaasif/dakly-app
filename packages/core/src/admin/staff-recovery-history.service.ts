import { Inject, Injectable } from '@nestjs/common';

import { TeamService } from '../team/team.service';
import { recoveryError } from './staff-recovery.errors';
import { StaffRecoveryRepository } from './staff-recovery.repository';

@Injectable()
export class StaffRecoveryHistoryService {
  constructor(
    @Inject(StaffRecoveryRepository) private readonly repository: StaffRecoveryRepository,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  async history(storeId: string, userId: string, before?: string) {
    const access = await this.team.accessFor(storeId, userId);
    if (!access || !this.team.canApproveSupport(access)) throw recoveryError('RECOVERY_DENIED');
    const rows = await this.repository.history(storeId, before);
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }
}
