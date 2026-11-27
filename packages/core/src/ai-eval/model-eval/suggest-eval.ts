import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import type { handoverReasons } from '@dakly/contracts/chats';
import { LlmError, type LlmDriver } from '@dakly/providers/llm/llm-driver';

import type { ConversationEntry } from '../../ai-agent/chat-memory';
import { conversationBlocks, windowConversation } from '../../ai-agent/conversation-window';
import { suggestReplyV1 } from '../../ai-agent/prompts/suggest-reply.v1';
import { checkReplyFacts } from '../../ai-agent/reply-fact-check';
import { suggestionTools } from '../../ai-agent/reply-mode';
import { shopBlock } from '../../ai-agent/shop-block';
import { defaultShopRules, shopRulesBlock } from '../../ai-agent/shop-rules';
import { deliveryPolicyPassage, deliveryZones, evalShop } from './eval-catalog';
import type { EvalMeter } from './eval-meter';
import { say } from './eval-output';
import { runFixtureTool } from './fixture-tools';
import type { MediaScore } from './media-eval';
import { meteredRespond } from './reply-pipeline';

const TIMEOUT_MS = 60_000;
const MAX_ROUNDS = 4;
// The taka sign sits in the Bangla block, so it does not count as Bangla script.
const BANGLA = /[\u0980-\u09F2\u09F4-\u09FF]/u;

export type SuggestCase = {
  id: string;
  reason: (typeof handoverReasons)[number];
  earlier?: ConversationEntry[];
  question: string;
  script: 'bangla' | 'latin';
  // The draft must use at least one of these words, in any case.
  mentionsAnyOf: string[];
  // Words that would promise what only the team can decide.
  forbid: string[];
};

const exchangePolicy = {
  itemId: 'eval-exchange-policy',
  content:
    'Exchange within 3 days of delivery for another size or colour of the same product. The customer pays the delivery charge again: ৳60 inside Dhaka, ৳120 outside Dhaka. There is no cash refund.',
};

export const suggestCases: SuggestCase[] = [
  {
    id: 'exchange-banglish',
    reason: 'refund',
    earlier: [
      { from: 'customer', text: 'kurti ta peyechi' },
      { from: 'shop', text: 'Dhonnobad! Kemon laglo janaben.' },
    ],
    question: 'Kurti ta size e choto hoise. Change kora jabe?',
    script: 'latin',
    mentionsAnyOf: ['size', 'change', 'exchange', 'bodl'],
    forbid: ['refund debo', 'taka ferot'],
  },
  {
    id: 'exchange-bangla',
    reason: 'refund',
    question: 'জুতাটা বড় হয়েছে, বদলানো যাবে?',
    script: 'bangla',
    mentionsAnyOf: ['সাইজ', 'বদল', 'পরিবর্তন'],
    forbid: ['টাকা ফেরত দেব'],
  },
  {
    id: 'damaged-english',
    reason: 'complaint',
    question: 'The panjabi I received is torn at the sleeve. This is not acceptable.',
    script: 'latin',
    mentionsAnyOf: ['order', 'photo', 'picture'],
    forbid: ['refund you', 'free of charge', 'compensat'],
  },
  {
    id: 'person-bangla',
    reason: 'asked_for_person',
    question: 'আমি একজন মানুষের সাথে কথা বলতে চাই',
    script: 'bangla',
    mentionsAnyOf: ['টিম', 'আমি', 'সাহায্য', 'বলুন'],
    forbid: [],
  },
  {
    id: 'wholesale-banglish',
    reason: 'out_of_scope',
    question: '50 ta panjabi wholesale nite chai, dam koto porbe?',
    script: 'latin',
    mentionsAnyOf: ['team', 'janabo', 'janano', 'check', 'size', 'design'],
    forbid: ['discount debo', '% off'],
  },
  {
    id: 'discount-english',
    reason: 'discount',
    question: 'If I buy two kurtis will you give me 20% off?',
    script: 'latin',
    mentionsAnyOf: ['team', 'check', 'confirm', 'price'],
    forbid: ['we can give you 20', 'yes, 20%', 'i can offer'],
  },
];

// The fixture shop answers like the real tools, with its exchange policy in the knowledge.
function answerTool(name: string, argumentsJson: string): object {
  if (name !== 'search_knowledge') return runFixtureTool(name, argumentsJson);
  const question = String((JSON.parse(argumentsJson) as { question?: unknown }).question ?? '');
  const passages = [
    ...(/exchange|change|return|size|বদল|ফেরত|সাইজ/iu.test(question) ? [exchangePolicy] : []),
    ...(/deliver|charge|ডেলিভারি|চার্জ/iu.test(question) ? [deliveryPolicyPassage] : []),
  ];
  return { passages };
}

function suggestContext(golden: SuggestCase) {
  const conversation: ConversationEntry[] = [
    ...(golden.earlier ?? []),
    { from: 'customer', text: golden.question },
  ];
  return [
    shopBlock(
      { address: null, ...evalShop },
      deliveryZones.map(({ name, chargeTaka }) => ({ name, chargeTaka })),
    ),
    shopRulesBlock(defaultShopRules),
    ...conversationBlocks(windowConversation(conversation, [golden.question])),
    '<product_candidates>{"products":[]}</product_candidates>',
    `<handover_reason>${golden.reason}</handover_reason>`,
  ].join('\n');
}

export function scoreSuggestion(golden: SuggestCase, draft: string, toolResults: object[]) {
  const problems: string[] = [];
  const text = draft.toLowerCase();
  if (BANGLA.test(draft) !== (golden.script === 'bangla')) problems.push('wrong script');
  if (!golden.mentionsAnyOf.some((word) => text.includes(word.toLowerCase())))
    problems.push('does not answer the ask');
  for (const word of golden.forbid) if (text.includes(word.toLowerCase())) problems.push(word);
  const checked = checkReplyFacts(
    draft,
    toolResults,
    { phone: evalShop.phone, linkBaseUrl: 'https://dkl.example' },
    [golden.question],
  );
  if (!checked.isSafe) problems.push(`fact check ${checked.failure}`);
  return problems;
}

async function draftFor(driver: LlmDriver, meter: EvalMeter, model: string, golden: SuggestCase) {
  const toolResults: object[] = [];
  let transcript = '';
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const result = await meteredRespond(driver, meter, `suggest:${model}`, {
      model,
      instructions: suggestReplyV1.instructions,
      input: suggestContext(golden) + transcript,
      output: chatReplyOutputSchema,
      tools: suggestionTools,
      timeoutMs: TIMEOUT_MS,
    });
    if (result.kind === 'output') {
      const parsed = chatReplyOutputSchema.safeParse(result.output);
      return parsed.success ? { draft: parsed.data.reply, toolResults } : undefined;
    }
    const answered = result.toolCalls.map(({ name, argumentsJson }) => {
      const answer = answerTool(name, argumentsJson);
      toolResults.push(answer);
      return { name, result: answer };
    });
    transcript += `\n<tool_results untrusted="true" round="${round}">${JSON.stringify(answered)}</tool_results>`;
  }
  return undefined;
}

export async function runSuggestEval(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
  verbose: boolean,
): Promise<MediaScore> {
  const failures: string[] = [];
  for (const golden of suggestCases) {
    try {
      const drafted = await draftFor(driver, meter, model, golden);
      const problems = drafted
        ? scoreSuggestion(golden, drafted.draft, drafted.toolResults)
        : ['no draft'];
      if (verbose && drafted) say(`  ${golden.id}: ${drafted.draft}`);
      if (problems.length) failures.push(`${golden.id}: ${problems.join(', ')}`);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      failures.push(`${golden.id}: ${error.code}`);
    }
  }
  return { passed: suggestCases.length - failures.length, total: suggestCases.length, failures };
}
