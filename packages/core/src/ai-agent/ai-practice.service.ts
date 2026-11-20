import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  MIN_TEST_QUESTIONS,
  type TestAnswerResponse,
  type TestQuestion,
} from '@dakly/contracts/ai-practice';
import { chatClassificationSchema } from '@dakly/contracts/chat-classification';

import { AiService } from '../ai/ai.service';
import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { practiceError } from './ai-practice.errors';
import { handoverReason } from './handover-reason';
import { classifyChat } from './prompts/classify-chat.v1';
import { gradeTestAnswer } from './prompts/grade-test-answer.v1';
import { checkReplyFacts } from './reply-fact-check';
import { SalesAgentService } from './sales-agent.service';

const gradeSchema = z.strictObject({ agrees: z.boolean() });

// Answers a shop's own questions the way the live agent would, but never sends, saves a
// message or spends a conversation unit.
@Injectable()
export class AiPracticeService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(KnowledgeSearchService) private readonly knowledge: KnowledgeSearchService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async testQuestions(storeId: string) {
    return { questions: (await this.settings.practice(storeId)).testQuestions };
  }

  async saveTestQuestions(storeId: string, userId: string, questions: TestQuestion[]) {
    await this.settings.saveTestQuestions(storeId, userId, questions, this.clock.now());
    return { questions };
  }

  async ask(storeId: string, question: string): Promise<TestAnswerResponse> {
    const classified = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'classify',
      prompt: classifyChat,
      input: JSON.stringify({ customer_messages: [question] }),
      output: chatClassificationSchema,
    });
    if (classified.kind === 'failure' && classified.code === 'AI_STORE_BUSY')
      throw practiceError('PRACTICE_AI_BUSY');
    const reason =
      classified.kind === 'output'
        ? handoverReason([question], classified.output)
        : 'ai_unavailable';
    if (reason) return { kind: 'handover', reason };
    const composed = await this.sales.compose({
      storeId,
      // Matches no real contact, so the order tools find nothing.
      contactId: randomUUID(),
      customerTexts: [question],
    });
    if (composed.kind === 'busy') throw practiceError('PRACTICE_AI_BUSY');
    if (composed.kind === 'handover') return composed;
    const shop = await this.stores.settings(storeId);
    const checked = checkReplyFacts(composed.text, composed.toolResults, {
      phone: shop.phone,
      linkBaseUrl: loadEnv().SHORT_LINK_BASE_URL,
    });
    if (!checked.isSafe) return { kind: 'handover', reason: 'out_of_scope' };
    return { kind: 'reply', text: composed.text };
  }

  async goLive(storeId: string, userId: string, connectionId: string): Promise<void> {
    await this.channels.requireActive(storeId, connectionId);
    if (!(await this.knowledge.hasActiveItem(storeId)))
      throw practiceError('GO_LIVE_NEEDS_KNOWLEDGE');
    if (!(await this.products.hasChatProduct(storeId)))
      throw practiceError('GO_LIVE_NEEDS_PRODUCTS');
    const { hasHandoverRules, testQuestions } = await this.settings.practice(storeId);
    if (!hasHandoverRules) throw practiceError('GO_LIVE_NEEDS_HANDOVER_RULES');
    if (testQuestions.length < MIN_TEST_QUESTIONS)
      throw practiceError('GO_LIVE_NEEDS_TEST_QUESTIONS');
    // One at a time: a store runs at most three model calls at once and each test needs two.
    const failed: number[] = [];
    for (const [index, test] of testQuestions.entries())
      if (!(await this.passes(storeId, test))) failed.push(index);
    if (failed.length)
      throw practiceError(
        'GO_LIVE_TESTS_FAILED',
        failed.map((index) => ({
          path: `testQuestions.${index}`,
          message: 'Did not get the expected answer',
        })),
      );
    await this.transaction.run(storeId, async () => {
      await this.channels.goLive(storeId, connectionId);
      await this.audit.record(storeId, {
        actor: { kind: 'user', userId },
        action: 'channel_connection.ai_went_live',
        entityType: 'channel_connection',
        entityId: connectionId,
        after: { state: 'live' },
      });
    });
  }

  private async passes(storeId: string, test: TestQuestion) {
    const answer = await this.ask(storeId, test.question);
    if (answer.kind !== 'reply') return false;
    // Wording differs between Bangla, Banglish and English, so a model judges the meaning.
    const grade = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'classify',
      prompt: gradeTestAnswer,
      input: JSON.stringify({
        question: test.question,
        expected_answer: test.expectedAnswer,
        reply: answer.text,
      }),
      output: gradeSchema,
    });
    if (grade.kind === 'failure' && grade.code === 'AI_STORE_BUSY')
      throw practiceError('PRACTICE_AI_BUSY');
    return grade.kind === 'output' && grade.output.agrees;
  }
}
