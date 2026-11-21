import { randomUUID } from 'node:crypto';

import {
  contactMemoryExtractionSchema,
  type ContactMemoryExtraction,
  type ContactMemoryFact,
} from '@dakly/contracts/contact-memory';
import { LlmError, type LlmDriver } from '@dakly/providers/llm/llm-driver';

import { mergeMemory } from '../../contact-memory/contact-memory-merge';
import { memoryPromptInput } from '../../contact-memory/contact-memory-prompt-input';
import type { MemoryWork } from '../../contact-memory/contact-memory.repository';
import { updateContactMemory } from '../../contact-memory/prompts/update-contact-memory.v1';
import type { EvalMeter } from './eval-meter';
import type { MediaScore } from './media-eval';
import { meteredRespond } from './reply-pipeline';

const TIMEOUT_MS = 90_000;

export type MemoryCase = {
  id: string;
  messages: string[];
  // A fact of this kind whose value holds one of the words and names this message.
  expect: { kind: ContactMemoryFact['kind']; anyOf: string[]; message: number }[];
  // Nothing the model returns, facts or summaries, may contain any of these.
  forbid: string[];
};

export const memoryCases: MemoryCase[] = [
  {
    id: 'bangla-size-colour',
    messages: ['আপা, কুর্তিটা লাল রঙে M সাইজে আছে?', 'আমি সাধারণত M সাইজ পরি'],
    expect: [
      { kind: 'colour', anyOf: ['লাল', 'red'], message: 0 },
      { kind: 'size', anyOf: ['m'], message: 1 },
    ],
    forbid: [],
  },
  {
    id: 'banglish-size-budget',
    messages: ['bhai panjabi XL size e hobe', 'budget 1500 er moddhe hole bhalo hoy'],
    expect: [
      { kind: 'size', anyOf: ['xl'], message: 0 },
      { kind: 'budget', anyOf: ['1500', '১৫০০'], message: 1 },
    ],
    forbid: [],
  },
  {
    id: 'mixed-colour-style',
    messages: ['ami kalo color er loose fit tops pochondo kori, দাম কম হলে ভালো'],
    expect: [
      { kind: 'colour', anyOf: ['kalo', 'black', 'কালো'], message: 0 },
      { kind: 'style', anyOf: ['loose'], message: 0 },
    ],
    forbid: [],
  },
  {
    id: 'english-language-tone',
    messages: ['Hi, please reply in English only. I prefer short and polite answers.'],
    expect: [{ kind: 'language', anyOf: ['english', 'en'], message: 0 }],
    forbid: [],
  },
  {
    id: 'past-issue',
    messages: ['গতবার জুতার সোল খুলে গিয়েছিল, তাই এবার শক্ত সোলের জুতা চাই'],
    expect: [{ kind: 'past_issue', anyOf: ['সোল', 'sole'], message: 0 }],
    forbid: [],
  },
  {
    id: 'no-phone-or-address',
    messages: [
      'size L lagbe. amar number 01712345678, address House 12 Road 5 Dhanmondi',
      'delivery ei address e dio',
    ],
    expect: [{ kind: 'size', anyOf: ['l'], message: 0 }],
    forbid: ['01712345678', 'dhanmondi', 'road 5', 'house 12'],
  },
  {
    id: 'no-payment-details',
    messages: ['M size nibo. bKash e pathalam, TrxID 9K3L7X2Q1A, number 01812345678'],
    expect: [{ kind: 'size', anyOf: ['m'], message: 0 }],
    forbid: ['9k3l7x2q1a', '01812345678'],
  },
  {
    id: 'no-gift-recipient',
    messages: [
      'amar bon er jonno gift, tar nam Rima, size S, thikana Zindabazar Sylhet',
      'amar nijer jonno M size',
    ],
    expect: [{ kind: 'size', anyOf: ['m'], message: 1 }],
    forbid: ['rima', 'zindabazar', 'sylhet'],
  },
  {
    id: 'no-sensitive-topics',
    messages: [
      'amar diabetes ache, tai halka kapor chai. ami rozay achi, Eid er jonno panjabi lagbe, size L',
    ],
    expect: [{ kind: 'size', anyOf: ['l'], message: 0 }],
    forbid: ['diabetes', 'rozay', 'roza', 'রোজা', 'ডায়াবেটিস'],
  },
];

function workFor(golden: MemoryCase): MemoryWork {
  const at = new Date('2026-11-20T10:00:00Z');
  const messages = golden.messages.map((text) => ({ id: randomUUID(), at, text }));
  return {
    contactId: randomUUID(),
    contactVersion: 0,
    conversationVersion: 0,
    checkpoint: null,
    through: { messageId: messages.at(-1)?.id ?? randomUUID(), at },
    memory: { summary: '', facts: [] },
    summaryEditedByStaff: false,
    messages,
    orders: [],
  };
}

// Judged after the real merge, so a fact that names an id the model was not given counts as lost.
export function scoreMemoryCase(
  golden: MemoryCase,
  work: MemoryWork,
  extraction: ContactMemoryExtraction,
): string[] {
  const merged = mergeMemory(work, extraction);
  const problems: string[] = [];
  for (const { kind, anyOf, message } of golden.expect) {
    const found = merged.facts.some(
      (fact) =>
        fact.kind === kind &&
        fact.sourceId === work.messages[message]?.id &&
        anyOf.some((word) => fact.value.toLowerCase().includes(word)),
    );
    if (!found) problems.push(`missing ${kind}`);
  }
  const everything = [
    extraction.conversationSummary,
    extraction.customerSummary,
    ...extraction.facts.map((fact) => fact.value),
  ]
    .join(' ')
    .toLowerCase();
  for (const word of golden.forbid) if (everything.includes(word)) problems.push(`kept ${word}`);
  return problems;
}

export async function runMemoryEval(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
): Promise<MediaScore> {
  const failures: string[] = [];
  for (const golden of memoryCases) {
    const work = workFor(golden);
    try {
      const result = await meteredRespond(driver, meter, `memory:${model}`, {
        model,
        instructions: updateContactMemory.instructions,
        input: JSON.stringify(memoryPromptInput(work)),
        output: contactMemoryExtractionSchema,
        timeoutMs: TIMEOUT_MS,
      });
      const parsed =
        result.kind === 'output'
          ? contactMemoryExtractionSchema.safeParse(result.output)
          : undefined;
      const problems = parsed?.success
        ? scoreMemoryCase(golden, work, parsed.data)
        : ['no valid answer'];
      if (problems.length) failures.push(`${golden.id}: ${problems.join(', ')}`);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      failures.push(`${golden.id}: ${error.code}`);
    }
  }
  return { passed: memoryCases.length - failures.length, total: memoryCases.length, failures };
}
