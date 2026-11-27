import { Inject, Injectable } from '@nestjs/common';

import type { chatChannels } from '@dakly/contracts/channels';
import type { ChatIntent } from '@dakly/contracts/chats';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ConversationIntentRepository } from './conversation-intent.repository';
import { InboxRepository } from './inbox.repository';

type IntentRead = {
  contactId: string;
  channel: (typeof chatChannels)[number];
  intent: ChatIntent | null;
  // The burst's messages, newest first.
  messageIds: string[];
};

@Injectable()
export class ConversationIntentService {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(ConversationIntentRepository)
    private readonly intents: ConversationIntentRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // What the customer wrote in the burst, oldest first, for keyword filters.
  async burstText(storeId: string, conversationId: string, messageIds: string[]) {
    const bodies = await this.intents.customerBodies(storeId, conversationId, messageIds);
    return bodies.join('\n');
  }

  // The tag and the event commit together, so an automation never starts on an intent the chat
  // does not show. A burst nobody classified still gets its event, with no intent.
  async record(storeId: string, conversationId: string, read: IntentRead) {
    const now = this.clock.now();
    await this.transaction.run(storeId, async () => {
      if (read.intent)
        await this.repository.update(
          storeId,
          conversationId,
          { intentTag: read.intent },
          { now, bumpVersion: false },
        );
      await this.outbox.publish({
        type: 'message.burst_received',
        storeId,
        occurredAt: now.toISOString(),
        payload: {
          conversationId,
          contactId: read.contactId,
          channel: read.channel,
          intent: read.intent,
          messageIds: read.messageIds.slice(0, 50),
        },
      });
    });
  }
}
