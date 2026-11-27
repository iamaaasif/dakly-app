import { Inject, Injectable } from '@nestjs/common';

import { InboxService } from '../messaging/inbox.service';
import { Clock } from '../platform/clock';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class ReplyAllowanceService {
  constructor(
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // A window that already holds a unit finishes even when the allowance is used up.
  async hasRoom(storeId: string, contactId: string) {
    const reference = await this.windowReference(storeId, contactId);
    return (
      (await this.usage.isConsumed(storeId, 'ai_conversation', reference)) ||
      (await this.usage.hasAllowance(storeId, 'ai_conversation', 1))
    );
  }

  // One unit covers every AI reply to a contact in the 24 hours after the first.
  async spend(storeId: string, contactId: string) {
    await this.usage.consume(storeId, {
      unit: 'ai_conversation',
      quantity: 1,
      reference: await this.windowReference(storeId, contactId),
    });
  }

  private async windowReference(storeId: string, contactId: string) {
    const start = (await this.inbox.firstAiReplyInDay(storeId, contactId)) ?? this.clock.now();
    return `ai-window:${contactId}:${start.toISOString()}`;
  }
}
