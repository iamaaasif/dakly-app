import { Inject, Injectable } from '@nestjs/common';

import { chatClassificationSchema } from '@dakly/contracts/chat-classification';
import type { ChatIntent, handoverReasons } from '@dakly/contracts/chats';

import { AiService } from '../ai/ai.service';
import { classifierInput, type ConversationEntry } from './chat-memory';
import { type HandoverCheckRules, handoverReason } from './handover-reason';
import { classifyChat } from './prompts/classify-chat.v4';

type Reason = (typeof handoverReasons)[number];
export type Classified = { reason: Reason | 'busy' | null; intent?: ChatIntent };

@Injectable()
export class ChatClassifierService {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  // The reason a person must take the messages, or null when the AI answers them, and what the
  // messages are about when the model read them.
  async classify(
    storeId: string,
    texts: string[],
    earlier: ConversationEntry[],
    rules: HandoverCheckRules,
  ): Promise<Classified> {
    if (!texts.length) return { reason: null };
    const result = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'classify',
      prompt: classifyChat,
      input: classifierInput(texts, earlier),
      output: chatClassificationSchema,
    });
    if (result.kind === 'output')
      return {
        reason: handoverReason(texts, result.output, rules),
        intent: result.output.intent,
      };
    if (result.kind === 'failure' && result.code === 'AI_STORE_BUSY') return { reason: 'busy' };
    return { reason: 'ai_unavailable' };
  }
}
