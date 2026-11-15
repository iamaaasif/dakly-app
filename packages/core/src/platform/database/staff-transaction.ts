import { Inject, Injectable } from '@nestjs/common';

import { StaffDatabase } from './staff-database';

@Injectable()
export class StaffTransaction {
  constructor(@Inject(StaffDatabase) private readonly database: StaffDatabase) {}
  run<TResult>(staffUserId: string, work: () => Promise<TResult>): Promise<TResult> {
    return this.database.forStaff(staffUserId, () => work());
  }
}
