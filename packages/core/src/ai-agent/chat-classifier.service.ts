import { Inject, Injectable } from '@nestjs/common';

import { chatClassificationSchema } from '@dakly/contracts/chat-classification';
import type { handoverReasons } from '@dakly/contracts/chats';

import { AiService } from '../ai/ai.service';
import { classifierInput, type ConversationEntry } from './chat-memory';
import { type HandoverCheckRules, handoverReason } from './handover-reason';
import { classifyChat } from './prompts/classify-chat.v3';

type Reason = (typeof handoverReasons)[number];

@Injectable()
export class ChatClassifierService {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  // The reason a person must take the messages, or null when the AI answers them.
  async classify(
    storeId: string,
    texts: string[],
    earlier: ConversationEntry[],
    rules: HandoverCheckRules,
  ): Promise<Reason | 'busy' | null> {
    if (!texts.length) return null;
    const result = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'classify',
      prompt: classifyChat,
      input: classifierInput(texts, earlier),
      output: chatClassificationSchema,
    });
    if (result.kind === 'output') return handoverReason(texts, result.output, rules);
    if (result.kind === 'failure' && result.code === 'AI_STORE_BUSY') return 'busy';
    return 'ai_unavailable';
  }
}
