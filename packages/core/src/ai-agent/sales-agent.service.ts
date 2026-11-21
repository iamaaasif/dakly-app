import { Inject, Injectable } from '@nestjs/common';

import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import type { handoverReasons } from '@dakly/contracts/chats';

import { AiService } from '../ai/ai.service';
import { InboxService } from '../messaging/inbox.service';
import { StoresService } from '../stores/stores.service';
import { customerConfirms } from './order-confirmation';
import { chatReply } from './prompts/chat-reply.v2';
import {
  type ToolScope,
  SalesAgentToolsService,
  salesAgentLlmTools,
} from './sales-agent-tools.service';

const MAX_ROUNDS = 4;
const REPLY_BUDGET_MS = 20_000;
const HISTORY_LENGTH = 20;
const CARD_TOOL = 'send_product_card';
const HAND_OVER_TOOL = 'hand_over';
const DRAFT_TOOL = 'draft_order';
const CONFIRM_TOOL = 'confirm_order';
const SOURCE_KEYS = ['productId', 'itemId', 'orderNumber'];

type Reason = (typeof handoverReasons)[number];
type ToolResult = { tool: string; result: object };

export type ComposedReply =
  | {
      kind: 'reply';
      text: string;
      aiRunId: string;
      cardTexts: string[];
      toolResults: object[];
      toolNames: string[];
      sources: { tool: string; refs: string[] }[];
    }
  | { kind: 'handover'; reason: Reason }
  | { kind: 'busy' };

export type ComposeInput = ToolScope & { customerTexts: string[] };

// Runs the model and the read-only tools. It sends nothing and holds no transaction.
@Injectable()
export class SalesAgentService {
  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(SalesAgentToolsService) private readonly tools: SalesAgentToolsService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async compose(input: ComposeInput): Promise<ComposedReply> {
    const { storeId } = input;
    const signal = AbortSignal.timeout(REPLY_BUDGET_MS);
    const results: ToolResult[] = [];
    const candidates = await this.productCandidates(input);
    if (candidates) results.push(candidates);
    const context = await this.context(input, candidates);
    let transcript = '';
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const attempt = await this.ai.run(storeId, {
        tier: 'reply',
        purpose: 'chat_reply',
        prompt: chatReply,
        input: context + transcript,
        output: chatReplyOutputSchema,
        tools: salesAgentLlmTools,
        signal,
      });
      if (attempt.kind === 'failure')
        return attempt.code === 'AI_STORE_BUSY'
          ? { kind: 'busy' }
          : { kind: 'handover', reason: 'ai_unavailable' };
      if (attempt.kind === 'output')
        return {
          kind: 'reply',
          text: attempt.output.reply,
          aiRunId: attempt.aiRunId,
          cardTexts: cardTexts(results),
          toolResults: results.map(({ result }) => result),
          toolNames: results.map(({ tool }) => tool),
          sources: sourcesOf(results),
        };
      const outcome = await this.answerToolCalls(input, attempt.toolCalls, results);
      if ('handover' in outcome) return { kind: 'handover', reason: outcome.handover };
      transcript += `\n<tool_results untrusted="true" round="${round}">${JSON.stringify(outcome.answered)}</tool_results>`;
    }
    return { kind: 'handover', reason: 'out_of_scope' };
  }

  private async answerToolCalls(
    input: ComposeInput,
    calls: readonly { name: string; argumentsJson: string }[],
    results: ToolResult[],
  ): Promise<{ handover: Reason } | { answered: { name: string; result: object }[] }> {
    const answered: { name: string; result: object }[] = [];
    for (const call of calls) {
      const result = isUnconfirmed(call, input.customerTexts, results)
        ? { error: 'CONFIRMATION_NOT_GIVEN' }
        : await this.tools.run(input, call.name, call.argumentsJson);
      if (call.name === HAND_OVER_TOOL && 'reason' in result)
        return { handover: result.reason as Reason };
      results.push({ tool: call.name, result });
      answered.push({ name: call.name, result });
    }
    return { answered };
  }

  // Search the customer's own words first, so the model starts with likely products.
  private async productCandidates(input: ComposeInput): Promise<ToolResult | undefined> {
    const query = input.customerTexts.join(' ').slice(0, 100).trim();
    if (query.length < 3) return undefined;
    const result = await this.tools.run(input, 'search_products', JSON.stringify({ query }));
    return { tool: 'search_products', result };
  }

  // Stable parts first so the provider's prompt cache can reuse them.
  private async context(input: ComposeInput, candidates: ToolResult | undefined) {
    const shop = await this.stores.settings(input.storeId);
    // A practice question has no conversation, so it has no history.
    const history = input.chat
      ? await this.inbox.messages(input.storeId, input.chat.conversationId, {
          limit: HISTORY_LENGTH,
        })
      : { items: [] };
    const conversation = history.items
      .filter((message) => message.kind !== 'note' && message.body)
      .reverse()
      .map((message) => ({
        from: message.direction === 'in' ? 'customer' : 'shop',
        text: message.body?.slice(0, 2000),
      }));
    return [
      `<shop>${JSON.stringify({ name: shop.name, phone: shop.phone, district: shop.district })}</shop>`,
      `<conversation untrusted="true">${JSON.stringify(conversation)}</conversation>`,
      `<product_candidates>${JSON.stringify(candidates?.result ?? { products: [] })}</product_candidates>`,
    ].join('\n');
  }
}

// An order is confirmed only on the customer's own yes, and never in the turn that drafted it.
function isUnconfirmed(
  call: { name: string; argumentsJson: string },
  customerTexts: readonly string[],
  results: readonly ToolResult[],
) {
  if (call.name !== CONFIRM_TOOL) return false;
  if (!customerConfirms(customerTexts)) return true;
  const drafted = results.some(
    ({ tool, result }) =>
      tool === DRAFT_TOOL &&
      'orderNumber' in result &&
      call.argumentsJson.includes(String(result.orderNumber)),
  );
  return drafted;
}

const cardTexts = (results: ToolResult[]) =>
  results.flatMap(({ tool, result }) =>
    tool === CARD_TOOL && 'cardText' in result ? [String(result.cardText)] : [],
  );

function sourcesOf(results: ToolResult[]) {
  return results
    .map(({ tool, result }) => ({ tool, refs: refsIn(result) }))
    .filter((s) => s.refs.length);
}

function refsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    SOURCE_KEYS.includes(key) ? [String(item)] : refsIn(item),
  );
}
