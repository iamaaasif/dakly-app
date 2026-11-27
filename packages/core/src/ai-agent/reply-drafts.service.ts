import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { UsageUnit } from '@dakly/contracts/billing';
import type { WriteConversationReplyInput, WrittenConversationReply } from '@dakly/contracts/chats';
import { toAsciiDigits } from '@dakly/contracts/digits';

import { AiService } from '../ai/ai.service';
import { BillingService } from '../billing/billing.service';
import { InboxService } from '../messaging/inbox.service';
import { Clock } from '../platform/clock';
import { AppError } from '../platform/errors/app-error';
import { UsageService } from '../usage/usage.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { rewriteReplyV1 } from './prompts/rewrite-reply.v1';
import { burstText, replyToolChat } from './reply-burst';
import { replyDraftError } from './reply-drafts.errors';
import { SalesAgentService } from './sales-agent.service';

const REPLY_LENGTH = 2000;
type Charge = { unit: UsageUnit; quantity: number } | undefined;

// Write with AI and AI rewrite in the reply box. Each finished draft uses one of the plan's free
// drafts for the month, then the plan's price in content credits.
@Injectable()
export class ReplyDraftsService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async write(
    storeId: string,
    conversationId: string,
    input: WriteConversationReplyInput,
  ): Promise<WrittenConversationReply> {
    await this.inbox.get(storeId, conversationId);
    const charge = await this.charge(storeId);
    const drafted =
      input.mode === 'write'
        ? await this.draft(storeId, conversationId)
        : await this.rewrite(storeId, input.text);
    if (charge) await this.consume(storeId, { ...charge, reference: drafted.aiRunId });
    return { text: drafted.text };
  }

  private async charge(storeId: string): Promise<Charge> {
    if (await this.usage.hasAllowance(storeId, 'ai_reply_draft', 1))
      return { unit: 'ai_reply_draft', quantity: 1 };
    const credits = await this.billing.replyDraftCredits(storeId);
    if (credits === 0) return undefined;
    if (!(await this.usage.hasAllowance(storeId, 'ai_content', credits)))
      throw replyDraftError('REPLY_DRAFT_CREDITS_UNAVAILABLE');
    return { unit: 'ai_content', quantity: credits };
  }

  private async consume(
    storeId: string,
    usage: { unit: UsageUnit; quantity: number; reference: string },
  ) {
    try {
      await this.usage.consume(storeId, usage);
    } catch (error) {
      if (error instanceof AppError && error.code === 'USAGE_ALLOWANCE_EXCEEDED')
        throw replyDraftError('REPLY_DRAFT_CREDITS_UNAVAILABLE');
      throw error;
    }
  }

  private async draft(storeId: string, conversationId: string) {
    const settings = await this.settings.forDrafts(storeId);
    if (!settings) throw replyDraftError('REPLY_DRAFT_UNAVAILABLE');
    const turn = await this.inbox.latestTurn(storeId, conversationId);
    if (!turn) throw replyDraftError('REPLY_DRAFT_NOTHING_TO_ANSWER');
    if (turn.channel === 'whatsapp') throw replyDraftError('REPLY_DRAFT_UNSUPPORTED');
    const burst = burstText(turn, settings.debounceSeconds * 1000, this.clock.now());
    const drafted = await this.sales.draftReply(
      {
        storeId,
        contactId: turn.contactId,
        chat: replyToolChat(conversationId, turn.channel, burst),
        customerTexts: burst.texts,
        rules: settings.rules,
      },
      { reason: null },
    );
    if (!drafted) throw replyDraftError('REPLY_DRAFT_UNAVAILABLE');
    return drafted;
  }

  private async rewrite(storeId: string, draft: string) {
    const result = await this.ai.run(storeId, {
      purpose: 'rewrite_reply',
      tier: 'writer',
      prompt: rewriteReplyV1,
      input: JSON.stringify({ draft }),
      output: z
        .object({ reply: z.string().trim().min(1).max(REPLY_LENGTH) })
        .refine(({ reply }) => keepsFacts(draft, reply)),
    });
    if (result.kind !== 'output') throw replyDraftError('REPLY_DRAFT_UNAVAILABLE');
    return { text: result.output.reply, aiRunId: result.aiRunId };
  }
}

// A polished reply may drop words but never a number or link the person did not type.
function keepsFacts(draft: string, reply: string) {
  const facts = (text: string) =>
    toAsciiDigits(text.normalize('NFKC')).match(/https?:\/\/\S+|\d+/gu) ?? [];
  const typed = new Set(facts(draft));
  return facts(reply).every((fact) => typed.has(fact));
}
