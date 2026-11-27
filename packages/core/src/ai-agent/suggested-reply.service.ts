import { Inject, Injectable } from '@nestjs/common';

import type { handoverReasons } from '@dakly/contracts/chats';

import { InboxService } from '../messaging/inbox.service';
import { NotificationStreamService } from '../notifications/notification-stream.service';
import { Clock } from '../platform/clock';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { burstText, replyToolChat } from './reply-burst';
import { SalesAgentService } from './sales-agent.service';

type Reason = (typeof handoverReasons)[number];

// A customer's own message the team must answer. With the model down, out of allowance or paused,
// or a store that cannot use it, there is no draft to write.
const DRAFT_REASONS = new Set<Reason>([
  'asked_for_person',
  'complaint',
  'refund',
  'discount',
  'angry',
  'out_of_scope',
  'ready_to_buy',
]);

@Injectable()
export class SuggestedReplyService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(NotificationStreamService) private readonly stream: NotificationStreamService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Reads the burst the AI handed over, as the reply job read it, and leaves the draft on the chat.
  async draft(storeId: string, conversationId: string, reason: Reason) {
    if (!DRAFT_REASONS.has(reason)) return;
    const settings = await this.settings.enabled(storeId);
    const turn = settings && (await this.inbox.handedOverTurn(storeId, conversationId));
    if (!settings || !turn || turn.channel === 'whatsapp') return;
    const burst = burstText(turn, settings.debounceSeconds * 1000, this.clock.now());
    const drafted = await this.sales.draftReply(
      {
        storeId,
        contactId: turn.contactId,
        chat: replyToolChat(conversationId, turn.channel, burst),
        customerTexts: burst.texts,
        rules: settings.rules,
      },
      { reason },
    );
    const at = turn.latest.createdAt;
    if (drafted && (await this.inbox.saveSuggestedReply(storeId, conversationId, drafted.text, at)))
      await this.stream.announceInbox(storeId, conversationId);
  }
}
