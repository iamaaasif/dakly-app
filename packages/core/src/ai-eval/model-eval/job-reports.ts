import type { LlmDriver } from '@dakly/providers/llm/llm-driver';

import { screenCustomerTexts } from '../../ai-agent/manipulation-screen';
import { MIN_HANDOVER_ACCURACY, scoreEval } from '../eval-scoring';
import type { EvalOutcome, GoldenCase } from '../golden-case';
import { runAdPhotoEval } from './ad-photo-eval';
import { runAssistantProductEval } from './assistant-product-eval';
import { runEmbeddingEval } from './embedding-eval';
import type { EvalMeter } from './eval-meter';
import { dollars, printTable, say } from './eval-output';
import { runKhataEval } from './khata-eval';
import { runTranscribeEval, runVisionEval, type MediaScore } from './media-eval';
import { runMemoryEval } from './memory-eval';
import { runOptionsPhotoEval, runOptionsTitleEval } from './options-eval';
import { classifyQuestion, composeReply, evalShopRules, handoverFor } from './reply-pipeline';

export type JobContext = {
  driver: LlmDriver;
  meter: EvalMeter;
  cases: GoldenCase[];
  verbose: boolean;
};

type Reasons = Map<string, ReturnType<typeof handoverFor>>;
const classifiedByModel = new Map<string, Reasons>();
const perThousand = (microUsd: number | undefined, count: number) =>
  dollars(((microUsd ?? 0) / Math.max(count, 1)) * 1000);

// Reasons are kept per model, so the reply job reuses what the fast job already paid for.
export async function classifyAll({ driver, meter, cases }: JobContext, model: string) {
  const known = classifiedByModel.get(model);
  if (known) return known;
  const reasons: Reasons = new Map();
  for (const golden of cases) {
    const screened = screenCustomerTexts([golden.question], {
      handOverDiscounts: evalShopRules(golden).handover.discounts,
      earlier: golden.earlier ?? [],
    });
    const classified = screened ? undefined : await classifyQuestion(driver, meter, model, golden);
    reasons.set(golden.id, screened ?? handoverFor(golden, classified));
  }
  classifiedByModel.set(model, reasons);
  return reasons;
}

export async function reportFast(context: JobContext, models: string[]) {
  const { cases, meter, verbose } = context;
  const wanted = cases.filter((golden) => golden.expectedHandover !== null);
  const rows: string[][] = [];
  for (const model of models) {
    const reasons = await classifyAll(context, model);
    const correct = wanted.filter((golden) => reasons.get(golden.id) === golden.expectedHandover);
    const needless = cases.filter(
      (golden) =>
        golden.expectedHandover === null &&
        reasons.get(golden.id) !== null &&
        reasons.get(golden.id) !== golden.acceptedHandover,
    );
    if (verbose)
      for (const golden of wanted.filter((item) => !correct.includes(item)))
        say(
          `${model} missed hand-over ${golden.id}: expected ${golden.expectedHandover}, got ${reasons.get(golden.id)}`,
        );
    const passed = correct.length / wanted.length >= MIN_HANDOVER_ACCURACY;
    rows.push([
      model,
      passed ? 'PASS' : 'FAIL',
      `${correct.length}/${wanted.length}`,
      String(needless.length),
      perThousand(meter.totals(`fast:${model}`)?.microUsd, cases.length),
    ]);
    if (verbose && needless.length)
      say(`${model} needless hand-overs: ${needless.map(({ id }) => id).join(', ')}`);
  }
  printTable(
    'Fast job (classify): hand-over reasons',
    ['model', 'gate', 'hand-overs right', 'needless', 'per 1,000 chats'],
    rows,
  );
}

async function scoreReplyModel(context: JobContext, model: string, reasons: Reasons) {
  const outcomes: Record<string, EvalOutcome> = {};
  const run = { driver: context.driver, meter: context.meter, model };
  for (const golden of context.cases) {
    const reason = reasons.get(golden.id);
    const note = (text: string) => {
      if (context.verbose) say(`[${model}] ${golden.id}: ${text}`);
    };
    outcomes[golden.id] = reason
      ? { kind: 'handover', reason }
      : await composeReply(run, golden, note);
    const outcome = outcomes[golden.id];
    if (outcome?.kind === 'reply') note(`reply: ${outcome.text}`);
  }
  return scoreEval(context.cases, outcomes);
}

export async function reportReply(context: JobContext, models: string[], fastModel: string) {
  const reasons = await classifyAll(context, fastModel);
  const answered = context.cases.filter((golden) => reasons.get(golden.id) === null).length;
  const rows: string[][] = [];
  for (const model of models) {
    const report = await scoreReplyModel(context, model, reasons);
    const totals = context.meter.totals(`reply:${model}`);
    rows.push([
      model,
      report.passed ? 'PASS' : 'FAIL',
      String(report.wrongPriceCaseIds.length),
      String(report.outOfStockOfferCaseIds.length),
      String(report.answeredAttackCaseIds.length + report.unsafeWordingCaseIds.length),
      `${report.productFound}/${report.productCases}`,
      `${report.handoverCorrect}/${report.handoverCases}`,
      String(report.unneededHandoverCaseIds.length),
      totals?.inputTokens
        ? `${Math.round((totals.cachedInputTokens / totals.inputTokens) * 100)}%`
        : '-',
      totals ? String(Math.round(totals.inputTokens / answered)) : '-',
      totals ? (totals.calls / answered).toFixed(2) : '-',
      perThousand(totals?.microUsd, answered),
    ]);
    if (context.verbose)
      say(
        `${model} wrong price: ${report.wrongPriceCaseIds}; oos offers: ${report.outOfStockOfferCaseIds}; missed products: ${report.missedProductCaseIds}; needless hand-overs: ${report.unneededHandoverCaseIds}; answered attacks: ${report.answeredAttackCaseIds}; unsafe wording: ${report.unsafeWordingCaseIds}; wrong photo: ${report.wrongPhotoCaseIds}`,
      );
  }
  printTable(
    `Reply job (${context.cases.length} golden cases, ${answered} answered by the model; hand-overs decided by ${fastModel})`,
    [
      'model',
      'gates',
      'wrong price',
      'oos offers',
      'attack leaks',
      'products found',
      'hand-overs right',
      'needless',
      'cached input',
      'input tokens per chat',
      'calls per chat',
      'per 1,000 chats',
    ],
    rows,
  );
}

type MediaJob = {
  title: string;
  unit: string;
  label: string;
  models: string[];
  run: (model: string) => Promise<MediaScore>;
};

async function reportMedia(meter: EvalMeter, { title, unit, label, models, run }: MediaJob) {
  const rows: string[][] = [];
  for (const model of models) {
    const score = await run(model);
    rows.push([
      model,
      score.passed === score.total ? 'PASS' : 'FAIL',
      `${score.passed}/${score.total}`,
      perThousand(meter.totals(`${label}:${model}`)?.microUsd, score.total),
      score.failures.join(' | '),
    ]);
  }
  printTable(title, ['model', 'gate', 'passed', `per 1,000 ${unit}`, 'failed'], rows);
}

export function reportVision({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Vision job (product photos)',
    unit: 'photos',
    label: 'vision',
    models,
    run: (model) => runVisionEval(driver, meter, model),
  });
}

export function reportAdPhotos({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Vision job (ad pictures with Bangla, Banglish and mixed titles)',
    unit: 'pictures',
    label: 'vision',
    models,
    run: (model) => runAdPhotoEval(driver, meter, model),
  });
}

export function reportKhata({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Vision job (khata pages)',
    unit: 'pages',
    label: 'vision',
    models,
    run: (model) => runKhataEval(driver, meter, model),
  });
}

export function reportOptionsFromTitle({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Fast job (product option suggestions from a title)',
    unit: 'titles',
    label: 'fast',
    models,
    run: (model) => runOptionsTitleEval(driver, meter, model),
  });
}

export function reportOptionsFromPhoto({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Vision job (product option suggestions from a photo)',
    unit: 'photos',
    label: 'vision',
    models,
    run: (model) => runOptionsPhotoEval(driver, meter, model),
  });
}

export function reportAssistantProducts({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Ask Dakly AI (product drafts and changes)',
    unit: 'prompts',
    label: 'reply',
    models,
    run: (model) => runAssistantProductEval(driver, meter, model),
  });
}

export function reportMemory({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Memory job (facts from Bangla, Banglish and mixed chats)',
    unit: 'chats',
    label: 'memory',
    models,
    run: (model) => runMemoryEval(driver, meter, model),
  });
}

export function reportTranscribe({ driver, meter }: JobContext, models: string[]) {
  return reportMedia(meter, {
    title: 'Transcribe job (Bangla and Banglish voice, synthetic speech)',
    unit: 'clips',
    label: 'transcribe',
    models,
    run: (model) => runTranscribeEval(driver, meter, model),
  });
}

export async function reportEmbed({ driver, meter }: JobContext, models: string[]) {
  const rows: string[][] = [];
  for (const model of models) {
    const score = await runEmbeddingEval(driver, meter, model);
    rows.push([
      model,
      `${score.top1}/${score.total}`,
      `${score.top3}/${score.total}`,
      score.misses.join(', '),
    ]);
  }
  printTable(
    'Embedding job (512 dimensions, product search)',
    ['model', 'top 1', 'top 3', 'missed top 3'],
    rows,
  );
}
