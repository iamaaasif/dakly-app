import 'reflect-metadata';

import { parseArgs } from 'node:util';

import { OpenAiLlmDriver } from '@dakly/providers/llm/openai/openai-llm-driver';

import { banglaGoldenCases } from '../golden-set.bangla';
import { sampleGoldenCases } from '../golden-set.sample';
import { EvalMeter } from './eval-meter';
import { say } from './eval-output';
import {
  reportEmbed,
  reportFast,
  reportReply,
  reportTranscribe,
  reportVision,
  type JobContext,
} from './job-reports';

const jobs = ['fast', 'reply', 'vision', 'transcribe', 'embed'] as const;
type Job = (typeof jobs)[number];

const chatModels = ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-terra', 'gpt-5.6-terra'];
const defaultModels: Record<Job, string[]> = {
  fast: chatModels,
  reply: chatModels,
  vision: chatModels,
  transcribe: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'gpt-transcribe'],
  embed: ['text-embedding-3-small', 'text-embedding-3-large'],
};
// The reply job takes its hand-over decisions from one fast model, so every reply model is
// judged on the same questions.
const baselineFastModel = 'gpt-6-luna';

const { values } = parseArgs({
  options: {
    jobs: { type: 'string' },
    models: { type: 'string' },
    'max-usd': { type: 'string', default: '4' },
    // AI-12 stock replies are not built, so its cases would fail for every model. Pass "none" to
    // run them anyway.
    pending: { type: 'string', default: 'AI-12' },
    verbose: { type: 'boolean', default: false },
  },
});

function selectedCases() {
  const pending = values.pending?.split(',') ?? [];
  return [...sampleGoldenCases, ...banglaGoldenCases].filter(
    (golden) => !golden.dependsOn || !pending.includes(golden.dependsOn),
  );
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
    fast: () => reportFast(context, modelsFor('fast')),
    reply: () => reportReply(context, modelsFor('reply'), baselineFastModel),
    vision: () => reportVision(context, modelsFor('vision')),
    transcribe: () => reportTranscribe(context, modelsFor('transcribe')),
    embed: () => reportEmbed(context, modelsFor('embed')),
  };
  for (const job of selected) await runners[job]();
  say(`\nTotal API spend this run: $${meter.spentUsd.toFixed(3)}`);
}

main().catch((error: unknown) => {
  say(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
