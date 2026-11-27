import { Inject, Injectable } from '@nestjs/common';

import { ConversationIntentService } from '../messaging/conversation-intent.service';
import { InboxService } from '../messaging/inbox.service';
import { Clock } from '../platform/clock';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { burstText } from './reply-burst';

// Used when the shop has no AI settings turned on, so the burst window matches the AI default.
export const DEFAULT_DEBOUNCE_SECONDS = 3;

// A burst the AI agent will not read (AI replies off, a chat with a person, WhatsApp) still
// reaches automations, announced once and with no intent.
@Injectable()
export class UnreadBurstService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(ConversationIntentService) private readonly intents: ConversationIntentService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async announce(storeId: string, conversationId: string, messageId: string) {
    const turn = await this.inbox.latestTurn(storeId, conversationId);
    // A later message in the burst has its own job and announces the whole burst.
    if (!turn || turn.latest.id !== messageId) return;
    const debounceSeconds =
      (await this.settings.enabled(storeId))?.debounceSeconds ?? DEFAULT_DEBOUNCE_SECONDS;
    const burst = burstText(turn, debounceSeconds * 1000, this.clock.now());
    await this.intents.record(storeId, conversationId, {
      contactId: turn.contactId,
      channel: turn.channel,
      intent: null,
      messageIds: burst.messageIds,
    });
  }
}
