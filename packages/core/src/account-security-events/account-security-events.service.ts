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
  async history(userId: string, before?: string) {
    const rows = await this.repository.list(userId, { before, limit: 51 });
    return {
      items: rows.slice(0, 50).map(({ id, event, actorType, reasonType, createdAt }) => ({
        id,
        event,
        actorType,
        reasonType,
        createdAt,
      })),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  list(userId: string, page: AccountSecurityHistory) {
    return this.repository.list(userId, page);
  }
}
