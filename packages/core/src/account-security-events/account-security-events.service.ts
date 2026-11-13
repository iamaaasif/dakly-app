import { Inject, Injectable } from '@nestjs/common';
import type {
  AccountSecurityEvent,
  AccountSecurityHistory,
} from '@dakly/contracts/account-security-events';
import { AccountSecurityEventsRepository } from './account-security-events.repository';

@Injectable()
export class AccountSecurityEventsService {
  constructor(
    @Inject(AccountSecurityEventsRepository)
    private readonly repository: AccountSecurityEventsRepository,
  ) {}
  async record(userId: string, entry: AccountSecurityEvent): Promise<void> {
    await this.repository.insert(userId, entry);
  }
  list(userId: string, page: AccountSecurityHistory) {
    return this.repository.list(userId, page);
  }
}
