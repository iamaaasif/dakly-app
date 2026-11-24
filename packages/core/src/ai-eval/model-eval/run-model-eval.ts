import 'reflect-metadata';

import { parseArgs } from 'node:util';

import { OpenAiLlmDriver } from '@dakly/providers/llm/openai/openai-llm-driver';

import { adContextGoldenCases } from '../golden-set.ad-context';
import { addOnGoldenCases } from '../golden-set.add-ons';
import { banglaGoldenCases } from '../golden-set.bangla';
import { bargainingGoldenCases, unclearGoldenCases } from '../golden-set.bargaining';
import { chatMemoryGoldenCases } from '../golden-set.chat-memory';
import { memoryGoldenCases } from '../golden-set.memory';
import { ownerSettingsGoldenCases } from '../golden-set.owner-settings';
import { sampleGoldenCases } from '../golden-set.sample';
import { stockDeliveryGoldenCases } from '../golden-set.stock-delivery';
import { EvalMeter } from './eval-meter';
import { say } from './eval-output';
import {
  reportEmbed,
  reportFast,
  reportKhata,
  reportMemory,
  reportAssistantProducts,
  reportOptionsFromPhoto,
  reportOptionsFromTitle,
  reportReply,
  reportTranscribe,
  reportVision,
  type JobContext,
} from './job-reports';

const jobs = [
  'fast',
  'reply',
  'assistant',
  'vision',
  'khata',
  'transcribe',
  'embed',
  'memory',
] as const;
type Job = (typeof jobs)[number];

const chatModels = ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-terra', 'gpt-5.6-terra'];
const defaultModels: Record<Job, string[]> = {
  fast: chatModels,
  reply: chatModels,
  assistant: chatModels,
  vision: chatModels,
  khata: ['gpt-6.1-terra'],
  transcribe: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'gpt-transcribe'],
  embed: ['text-embedding-3-small', 'text-embedding-3-large'],
  memory: chatModels,
};
// The reply job takes its hand-over decisions from one fast model, so every reply model is
// judged on the same questions.
const baselineFastModel = 'gpt-6-luna';

const { values } = parseArgs({
  options: {
    jobs: { type: 'string' },
    models: { type: 'string' },
    'max-usd': { type: 'string', default: '4' },
    // Skips the cases of tasks that are not built yet, such as "AI-12".
    pending: { type: 'string', default: '' },
    verbose: { type: 'boolean', default: false },
  },
});

function selectedCases() {
  const pending = values.pending?.split(',') ?? [];
  return [
    ...sampleGoldenCases,
    ...banglaGoldenCases,
    ...memoryGoldenCases,
    ...stockDeliveryGoldenCases,
    ...bargainingGoldenCases,
    ...unclearGoldenCases,
    ...chatMemoryGoldenCases,
    ...adContextGoldenCases,
    ...ownerSettingsGoldenCases,
    ...addOnGoldenCases,
  ].filter((golden) => !golden.dependsOn || !pending.includes(golden.dependsOn));
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const meter = new EvalMeter(Number(values['max-usd']) * 1e6);
  const context: JobContext = {
    driver: new OpenAiLlmDriver(apiKey),
    meter,
    cases: selectedCases(),
    verbose: values.verbose,
  };
  const selected = (values.jobs?.split(',') ?? [...jobs]) as Job[];
  if (values.models && selected.length > 1) throw new Error('--models needs a single --jobs value');
  const modelsFor = (job: Job) => values.models?.split(',') ?? defaultModels[job];
  const runners: Record<Job, () => Promise<void>> = {
    fast: async () => {
      await reportFast(context, modelsFor('fast'));
      await reportOptionsFromTitle(context, modelsFor('fast'));
    },
    reply: () => reportReply(context, modelsFor('reply'), baselineFastModel),
    assistant: () => reportAssistantProducts(context, modelsFor('assistant')),
    vision: async () => {
      await reportVision(context, modelsFor('vision'));
      await reportOptionsFromPhoto(context, modelsFor('vision'));
    },
    khata: () => reportKhata(context, modelsFor('khata')),
    transcribe: () => reportTranscribe(context, modelsFor('transcribe')),
    embed: () => reportEmbed(context, modelsFor('embed')),
    memory: () => reportMemory(context, modelsFor('memory')),
  };
  for (const job of selected) await runners[job]();
  say(`\nTotal API spend this run: $${meter.spentUsd.toFixed(3)}`);
}

main().catch((error: unknown) => {
  say(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
