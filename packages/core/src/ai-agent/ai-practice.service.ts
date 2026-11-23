import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  getDeliveryChargeTool,
  getProductTool,
  searchKnowledgeTool,
  searchProductsTool,
  sendProductCardTool,
} from '@dakly/contracts/ai-agent-tools';
import {
  MIN_TEST_QUESTIONS,
  type TestAnswerResponse,
  type TestAnswerSource,
  type TestQuestion,
} from '@dakly/contracts/ai-practice';
import { chatClassificationSchema } from '@dakly/contracts/chat-classification';

import { AiService } from '../ai/ai.service';
import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductsService } from '../products/products.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { practiceError } from './ai-practice.errors';
import { handoverReason } from './handover-reason';
import { screenCustomerTexts } from './manipulation-screen';
import { classifyChat } from './prompts/classify-chat.v1';
import { gradeTestAnswer } from './prompts/grade-test-answer.v1';
import { SalesAgentService } from './sales-agent.service';

const productToolNames = [searchProductsTool.name, getProductTool.name, sendProductCardTool.name];

const gradeSchema = z.strictObject({ agrees: z.boolean() });

// Answers a shop's own questions the way the live agent would, but never sends, saves a
// message or spends a conversation unit.
@Injectable()
export class AiPracticeService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(KnowledgeSearchService) private readonly knowledge: KnowledgeSearchService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
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

  async testers(storeId: string) {
    return { contactIds: await this.settings.testers(storeId) };
  }

  async saveTesters(storeId: string, userId: string, contactIds: string[]) {
    const unique = [...new Set(contactIds)];
    for (const id of unique)
      if (!(await this.contacts.findRecipient(storeId, id)))
        throw practiceError('PRACTICE_TESTER_NOT_FOUND');
    const before = await this.settings.testers(storeId);
    await this.transaction.run(storeId, async () => {
      await this.settings.saveTesters(storeId, userId, unique, this.clock.now());
      await this.audit.record(storeId, {
        actor: { kind: 'user', userId },
        action: 'ai_agent.testers_changed',
        entityType: 'ai_agent_settings',
        // The settings row is one per store, so the store id names it.
        entityId: storeId,
        before: { ids: before },
        after: { ids: unique },
      });
    });
    return { contactIds: unique };
  }

  async ask(storeId: string, question: string): Promise<TestAnswerResponse> {
    const { handOverDiscounts } = await this.settings.practice(storeId);
    const screened = screenCustomerTexts([question], { handOverDiscounts, earlierTexts: [] });
    if (screened) return { kind: 'handover', reason: screened };
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
        ? handoverReason([question], classified.output, handOverDiscounts)
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
    return { kind: 'reply', text: composed.text, source: await this.sourceOf(storeId, composed) };
  }

  // Knowledge wins over store rules, and store rules over products, because an owner's own answer is
  // the thing they can change from this screen. A product search runs on every question, so it only
  // counts when the model did not look up a delivery charge.
  private async sourceOf(
    storeId: string,
    composed: { toolNames: string[]; sources: { tool: string; refs: string[] }[] },
  ): Promise<TestAnswerSource> {
    const itemId = composed.sources.find((source) => source.tool === searchKnowledgeTool.name)
      ?.refs[0];
    const item = itemId ? await this.knowledge.describe(storeId, itemId) : undefined;
    if (item?.kind === 'file') return { kind: 'file', fileName: item.fileName };
    if (item) return { kind: 'answer', question: item.question };
    if (composed.toolNames.includes(getDeliveryChargeTool.name)) return { kind: 'store_rules' };
    const foundProduct = composed.sources.some((source) => productToolNames.includes(source.tool));
    if (foundProduct) return { kind: 'products' };
    return { kind: 'general' };
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
      purpose: 'grade_test',
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
