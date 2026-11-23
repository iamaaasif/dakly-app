import {
  chatClassificationSchema,
  type ChatClassification,
} from '@dakly/contracts/chat-classification';
import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import { photoSearchText, type handoverReasons } from '@dakly/contracts/chats';
import { LlmError, type LlmDriver, type LlmRequest } from '@dakly/providers/llm/llm-driver';

import { handoverReason } from '../../ai-agent/handover-reason';
import { chatReplyV6 } from '../../ai-agent/prompts/chat-reply.v6';
import { classifyChat } from '../../ai-agent/prompts/classify-chat.v1';
import {
  checkReplyFacts,
  factCheckFailedBlock,
  type FactCheckFailure,
} from '../../ai-agent/reply-fact-check';
import { salesAgentLlmTools } from '../../ai-agent/sales-agent-tools.service';
import type { EvalOutcome, GoldenCase } from '../golden-case';
import { evalPhotoKey, evalShop } from './eval-catalog';
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
  golden: GoldenCase,
  classified: ChatClassification | undefined,
): Reason | null {
  return classified
    ? handoverReason([golden.question], classified, !golden.holdsPrice)
    : 'ai_unavailable';
}

type Run = { driver: LlmDriver; meter: EvalMeter; model: string };
type Note = (note: string) => void;
type ToolCall = { name: string; argumentsJson: string };
type Asked = Pick<GoldenCase, 'question' | 'memory' | 'earlierMessages'>;

function replyContext({ question, memory, earlierMessages = [] }: Asked, candidates: object) {
  const conversation = [...earlierMessages, question].map((text) => ({ from: 'customer', text }));
  return [
    `<shop>${JSON.stringify(evalShop)}</shop>`,
    ...(memory ? [`<customer_memory untrusted="true">${memory}</customer_memory>`] : []),
    `<conversation untrusted="true">${JSON.stringify(conversation)}</conversation>`,
    `<product_candidates>${JSON.stringify(candidates)}</product_candidates>`,
  ].join('\n');
}

// The key of the photo on the last product card the run sent, or null for a card with no photo.
function sentCardPhoto(toolResults: object[]) {
  const cards = toolResults.filter((result) => 'cardText' in result && 'photoFileId' in result);
  const last = cards.at(-1) as { photoFileId?: unknown } | undefined;
  return last ? evalPhotoKey(last.photoFileId) : undefined;
}

function factCheckFailure(reply: string, toolResults: object[], question: string) {
  const checked = checkReplyFacts(
    reply,
    toolResults,
    { phone: evalShop.phone, linkBaseUrl: 'https://dkl.example' },
    [question],
  );
  return checked.isSafe ? undefined : checked.failure;
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

// The same flow as SalesAgentService.compose: a reply that fails the fact check is written once
// more with the failure named, and a second failure hands over.
export async function composeReply(
  run: Run,
  asked: Asked,
  note: Note = () => undefined,
): Promise<EvalOutcome> {
  const first = await composeOnce(run, asked, note);
  if (first.kind !== 'reply') return first.outcome;
  const failure = factCheckFailure(first.text, first.toolResults, asked.question);
  if (!failure) return replyOutcome(first);
  note(`fact check ${failure}: ${first.text}`);
  const second = await composeOnce(run, asked, note, { failure, reply: first.text });
  if (second.kind !== 'reply') return second.outcome;
  const failedAgain = factCheckFailure(second.text, second.toolResults, asked.question);
  if (!failedAgain) return replyOutcome(second);
  note(`fact check ${failedAgain} again: ${second.text}`);
  return { kind: 'handover', reason: 'out_of_scope' };
}

type Composed =
  { kind: 'reply'; text: string; toolResults: object[] } | { kind: 'ended'; outcome: EvalOutcome };

const replyOutcome = ({ text, toolResults }: { text: string; toolResults: object[] }) => ({
  kind: 'reply' as const,
  text,
  cardPhoto: sentCardPhoto(toolResults),
});

async function composeOnce(
  { driver, meter, model }: Run,
  asked: Asked,
  note: Note,
  rejected?: { failure: FactCheckFailure; reply: string },
): Promise<Composed> {
  const ended = (outcome: EvalOutcome): Composed => ({ kind: 'ended', outcome });
  const toolResults: object[] = [];
  const candidates = replyCandidates(asked.question);
  if (candidates) toolResults.push(candidates);
  const context = replyContext(asked, candidates ?? { products: [] });
  let transcript = rejected ? `\n${factCheckFailedBlock(rejected.failure, rejected.reply)}` : '';
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const result = await meteredRespond(driver, meter, `reply:${model}`, {
      model,
      instructions: chatReplyV6.instructions,
      input: context + transcript,
      output: chatReplyOutputSchema,
      tools: salesAgentLlmTools,
      timeoutMs: TIMEOUT_MS,
    }).catch((error: unknown) => {
      if (error instanceof LlmError) return undefined;
      throw error;
    });
    if (!result) return ended({ kind: 'handover', reason: 'ai_unavailable' });
    if (result.kind === 'output') {
      const parsed = chatReplyOutputSchema.safeParse(result.output);
      return parsed.success
        ? { kind: 'reply', text: parsed.data.reply, toolResults }
        : ended({ kind: 'handover', reason: 'out_of_scope' });
    }
    const outcome = answerToolCalls(result.toolCalls, toolResults, note);
    if (outcome.handover) return ended({ kind: 'handover', reason: outcome.handover });
    transcript += `\n<tool_results untrusted="true" round="${round}">${JSON.stringify(outcome.answered)}</tool_results>`;
  }
  note('ran out of tool rounds');
  return ended({ kind: 'handover', reason: 'out_of_scope' });
}
