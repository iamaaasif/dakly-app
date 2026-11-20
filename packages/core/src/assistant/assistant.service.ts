import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  askDaklyOutputSchema,
  type AskDaklyAnswer,
  type AskDaklyRequest,
} from '@dakly/contracts/assistant';
import type { StoreAccess } from '@dakly/contracts/team';

import { AiService } from '../ai/ai.service';
import { UsageService } from '../usage/usage.service';
import { numbersAreFromTools } from './assistant-answer-check';
import { AssistantToolsService } from './assistant-tools.service';
import { assistantError } from './assistant.errors';
import { askDaklyV1 } from './prompts/ask-dakly.v1';

const MAX_ROUNDS = 4;
const ASK_BUDGET_MS = 20_000;
const sourceLabels: Record<string, string> = {
  get_sales: 'Orders',
  get_marketing_results: 'Marketing results',
  get_customers: 'Customers',
};
const CANNOT_ANSWER =
  'I can’t answer that yet. I can answer questions about your orders, sales, marketing results and customers.';

type ToolResult = { tool: string; result: object };

// Runs the model and the read-only report tools. It changes nothing and holds no transaction.
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AssistantToolsService) private readonly tools: AssistantToolsService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async ask(
    storeId: string,
    access: StoreAccess,
    { question, history }: AskDaklyRequest,
  ): Promise<AskDaklyAnswer> {
    const llmTools = this.tools.llmTools(access);
    if (!llmTools.length) return { kind: 'cannot_answer', text: CANNOT_ANSWER };
    if (!(await this.usage.hasAllowance(storeId, 'ai_ask', 1)))
      throw assistantError('ASK_CREDITS_UNAVAILABLE');

    const signal = AbortSignal.timeout(ASK_BUDGET_MS);
    const usageReference = randomUUID();
    const context = [
      `<earlier_turns untrusted="true">${JSON.stringify(history)}</earlier_turns>`,
      `<question untrusted="true">${JSON.stringify(question)}</question>`,
    ].join('\n');
    const results: ToolResult[] = [];
    let transcript = '';
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const attempt = await this.ai.run(storeId, {
        purpose: 'ask',
        usageReference,
        tier: 'reply',
        prompt: askDaklyV1,
        input: context + transcript,
        output: askDaklyOutputSchema,
        tools: llmTools,
        signal,
      });
      if (attempt.kind === 'failure') return this.failed(attempt.code);
      if (attempt.kind === 'output') return this.answer(storeId, attempt.output.reply, results);
      const answered: ToolResult[] = [];
      for (const call of attempt.toolCalls) {
        const result = await this.tools.run(storeId, access, call.name, call.argumentsJson);
        answered.push({ tool: call.name, result });
      }
      results.push(...answered);
      transcript += `\n<tool_results round="${round}">${JSON.stringify(answered)}</tool_results>`;
    }
    return this.unanswered(storeId);
  }

  private async answer(
    storeId: string,
    reply: string,
    results: ToolResult[],
  ): Promise<AskDaklyAnswer> {
    const found = results.filter(({ result }) => !('error' in result));
    if (
      !numbersAreFromTools(
        reply,
        found.map(({ result }) => result),
      )
    )
      return this.unanswered(storeId);
    if (!found.length) return { kind: 'cannot_answer', text: reply };
    return {
      kind: 'answer',
      text: reply,
      sources: sourcesOf(found),
      creditsLeft: await this.usage.remaining(storeId, 'ai_ask'),
    };
  }

  private unanswered(storeId: string): AskDaklyAnswer {
    this.logger.warn({ storeId }, 'Ask Dakly AI could not answer; a new tool may be needed');
    return { kind: 'cannot_answer', text: CANNOT_ANSWER };
  }

  private failed(code: string): AskDaklyAnswer {
    if (code === 'USAGE_ALLOWANCE_EXCEEDED') throw assistantError('ASK_CREDITS_UNAVAILABLE');
    if (code === 'AI_OUTPUT_MISMATCH') return { kind: 'cannot_answer', text: CANNOT_ANSWER };
    throw assistantError('ASK_UNAVAILABLE');
  }
}

function sourcesOf(results: ToolResult[]): string[] {
  const labels = results.map(({ tool, result }) => {
    const days = 'days' in result ? `, last ${String(result.days)} days` : '';
    return `${sourceLabels[tool] ?? tool}${days}`;
  });
  return [...new Set(labels)];
}
