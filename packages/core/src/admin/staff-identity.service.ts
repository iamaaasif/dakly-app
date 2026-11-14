import { Inject, Injectable } from '@nestjs/common';
import { StaffIdentityRepository } from './staff-identity.repository';
@Injectable()
export class StaffIdentityService {
  constructor(
    @Inject(StaffIdentityRepository) private readonly repository: StaffIdentityRepository,
  ) {}
  conflictsWithStore(storeId: string, staffUserId: string) {
    return this.repository.conflicts(storeId, staffUserId);
  }
  isLinkedUser(staffUserId: string, userId: string) {
    return this.repository.linked(staffUserId, userId);
  }
}
