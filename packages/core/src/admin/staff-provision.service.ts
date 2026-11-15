import { Inject, Injectable } from '@nestjs/common';

import type { StaffProvisionInput } from '@dakly/contracts/staff-auth';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { staffError } from './admin.errors';
import { StaffAuditService } from './staff-audit.service';
import { newStaffProof, staffTokenHash } from './staff-tokens';
import { StaffRepository } from './staff.repository';

@Injectable()
export class StaffProvisionService {
  constructor(
    @Inject(StaffRepository) private readonly repository: StaffRepository,
    @Inject(StaffTransaction) private readonly transaction: StaffTransaction,
    @Inject(StaffAuditService) private readonly audit: StaffAuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  async provision(input: StaffProvisionInput): Promise<{ proof: string; staffUserId: string }> {
    const existingId = await this.repository.findIdentity(input.accessSubject, input.email);
    const staffUserId = existingId ?? newId();
    const proof = newStaffProof();
    await this.transaction.run(staffUserId, async () => {
      if (existingId) {
        const staff = await this.repository.lock(existingId);
        if (!staff || staff.enrolledAt || staff.status !== 'active')
          throw staffError('STAFF_INVALID_CREDENTIALS');
      }
      await this.audit.provisioned(
        staffUserId,
        input.operatorIdentity,
        input.reason,
        Boolean(existingId),
      );
      if (existingId) await this.repository.consumeAll(staffUserId, this.clock.now());
      else await this.repository.provision(staffUserId, input);
      await this.repository.addChallenge(staffUserId, {
        tokenHash: staffTokenHash(proof),
        purpose: 'enroll',
        expiresAt: new Date(this.clock.now().getTime() + 86400000),
      });
    });
    return { proof, staffUserId };
  }
}
