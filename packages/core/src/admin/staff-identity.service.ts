import { Inject, Injectable } from '@nestjs/common';

import { StaffIdentityRepository } from './staff-identity.repository';

@Injectable()
export class StaffIdentityService {
  constructor(
    @Inject(StaffIdentityRepository) private readonly repository: StaffIdentityRepository,
  ) {}

  recoveryConflict(
    userId: string,
    staffUserId: string,
    storeIds: string[],
    contacts: { phone?: string | null; email?: string | null }[],
  ) {
    return this.repository.recoveryConflict(userId, staffUserId, storeIds, contacts);
  }

  conflictsWithStore(storeId: string, staffUserId: string) {
    return this.repository.conflicts(storeId, staffUserId);
  }

  isLinkedUser(staffUserId: string, userId: string) {
    return this.repository.linked(staffUserId, userId);
  }
}
