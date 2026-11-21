import {
  chatClassificationSchema,
  type ChatClassification,
} from '@dakly/contracts/chat-classification';
import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import { photoSearchText, type handoverReasons } from '@dakly/contracts/chats';
import { LlmError, type LlmDriver, type LlmRequest } from '@dakly/providers/llm/llm-driver';

import { handoverReason } from '../../ai-agent/handover-reason';
import { chatReply } from '../../ai-agent/prompts/chat-reply.v2';
import { classifyChat } from '../../ai-agent/prompts/classify-chat.v1';
import { checkReplyFacts } from '../../ai-agent/reply-fact-check';
import { salesAgentLlmTools } from '../../ai-agent/sales-agent-tools.service';
import type { EvalOutcome } from '../golden-case';
import { evalShop } from './eval-catalog';
import type { EvalMeter } from './eval-meter';
import { matchEvalPhoto, runFixtureTool } from './fixture-tools';

const MAX_ROUNDS = 4;
const TIMEOUT_MS = 60_000;
const MIN_SEARCH_LENGTH = 3;
type Reason = (typeof handoverReasons)[number];

// A failed call still billed its tokens, so the meter counts them before the error goes on.
export async function meteredRespond(
  driver: LlmDriver,
  meter: EvalMeter,
  label: string,
  request: LlmRequest,
) {
  try {
    const result = await driver.respond(request);
    meter.record(label, request.model, result.usage);
    return result;
  } catch (error) {
    if (error instanceof LlmError && error.usage) meter.record(label, request.model, error.usage);
    throw error;
  }
}

export async function classifyQuestion(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
  question: string,
): Promise<ChatClassification | undefined> {
  try {
    const result = await meteredRespond(driver, meter, `fast:${model}`, {
      model,
      instructions: classifyChat.instructions,
      input: JSON.stringify({ customer_messages: [question] }),
      output: chatClassificationSchema,
      timeoutMs: TIMEOUT_MS,
    });
    if (result.kind !== 'output') return undefined;
    const parsed = chatClassificationSchema.safeParse(result.output);
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    if (error instanceof LlmError) return undefined;
    throw error;
  }
}

export function handoverFor(
  question: string,
  classified: ChatClassification | undefined,
): Reason | null {
  return classified ? handoverReason([question], classified) : 'ai_unavailable';
}

type Run = { driver: LlmDriver; meter: EvalMeter; model: string };
type Note = (note: string) => void;
type ToolCall = { name: string; argumentsJson: string };

function replyContext(question: string, candidates: object) {
  return [
    `<shop>${JSON.stringify(evalShop)}</shop>`,
    `<conversation untrusted="true">${JSON.stringify([{ from: 'customer', text: question }])}</conversation>`,
    `<product_candidates>${JSON.stringify(candidates)}</product_candidates>`,
  ].join('\n');
}

function checkedReply(reply: string, toolResults: object[], note: Note): EvalOutcome {
  const checked = checkReplyFacts(reply, toolResults, {
    phone: evalShop.phone,
    linkBaseUrl: 'https://dkl.example',
  });
  if (checked.isSafe) return { kind: 'reply', text: reply };
  note(`fact check ${checked.failure}: ${reply}`);
  return { kind: 'handover', reason: 'out_of_scope' };
}

// A hand_over call ends the loop with its reason; any other call adds its result for the next round.
function answerToolCalls(calls: ToolCall[], toolResults: object[], note: Note) {
  const answered: { name: string; result: object }[] = [];
  for (const call of calls) {
    const result = runFixtureTool(call.name, call.argumentsJson);
    if (call.name === 'hand_over' && 'reason' in result) {
      note(`hand_over ${String(result.reason)}`);
      return { handover: result.reason as Reason };
    }
    toolResults.push(result);
    answered.push({ name: call.name, result });
  }
  return { answered };
}

// The photo match for a photo's text, else a search of what the customer wrote, as the real agent does.
function replyCandidates(question: string): object | undefined {
  const photo = photoSearchText(question);
  if (photo !== undefined) return matchEvalPhoto(photo);
  const query = question.slice(0, 100).trim();
  return query.length >= MIN_SEARCH_LENGTH
    ? runFixtureTool('search_products', JSON.stringify({ query }))
    : undefined;
}

// The same loop as SalesAgentService.compose, with fixture tools instead of the database.
export async function composeReply(
  { driver, meter, model }: Run,
  question: string,
  note: Note = () => undefined,
): Promise<EvalOutcome> {
  const toolResults: object[] = [];
  const candidates = replyCandidates(question);
  if (candidates) toolResults.push(candidates);
  const context = replyContext(question, candidates ?? { products: [] });
  let transcript = '';
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const result = await meteredRespond(driver, meter, `reply:${model}`, {
      model,
      instructions: chatReply.instructions,
      input: context + transcript,
      output: chatReplyOutputSchema,
      tools: salesAgentLlmTools,
      timeoutMs: TIMEOUT_MS,
    }).catch((error: unknown) => {
      if (error instanceof LlmError) return undefined;
      throw error;
    });
    if (!result) return { kind: 'handover', reason: 'ai_unavailable' };
    if (result.kind === 'output') {
      const parsed = chatReplyOutputSchema.safeParse(result.output);
      return parsed.success
        ? checkedReply(parsed.data.reply, toolResults, note)
        : { kind: 'handover', reason: 'out_of_scope' };
    }
    const outcome = answerToolCalls(result.toolCalls, toolResults, note);
    if (outcome.handover) return { kind: 'handover', reason: outcome.handover };
    transcript += `\n<tool_results round="${round}">${JSON.stringify(outcome.answered)}</tool_results>`;
  }
  note('ran out of tool rounds');
  return { kind: 'handover', reason: 'out_of_scope' };
}
