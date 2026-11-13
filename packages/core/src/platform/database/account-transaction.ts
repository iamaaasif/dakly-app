import { Injectable } from '@nestjs/common';
import { AccountDatabase } from './account-database';

@Injectable()
export class AccountTransaction {
  constructor(private readonly database: AccountDatabase) {}
  run<TResult>(userId: string, work: () => Promise<TResult>): Promise<TResult> {
    return this.database.forUser(userId, () => work());
  }
}
