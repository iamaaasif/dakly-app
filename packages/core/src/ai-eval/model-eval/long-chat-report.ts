import { scoreEval } from '../eval-scoring';
import type { EvalOutcome } from '../golden-case';
import { dollars, printTable, say } from './eval-output';
import { classifyAll, type JobContext } from './job-reports';
import { composeReply, type Run } from './reply-pipeline';

const modes = [undefined, 'last20'] as const;
type Mode = (typeof modes)[number];
const modeName = (history: Mode) => (history ? 'last 20 (before)' : 'window (now)');

// One mode over all cases: the outcomes and how long each reply took.
async function runMode(context: JobContext, run: Run, fastModel: string) {
  const reasons = await classifyAll(context, fastModel);
  const outcomes: Record<string, EvalOutcome> = {};
  const times: number[] = [];
  const name = modeName(run.history);
  for (const golden of context.cases) {
    const reason = reasons.get(golden.id);
    const started = Date.now();
    outcomes[golden.id] = reason
      ? { kind: 'handover', reason }
      : await composeReply(run, golden, (text) => {
          if (context.verbose) say(`[${run.model}/${name}] ${golden.id}: ${text}`);
        });
    times.push(Date.now() - started);
  }
  times.sort((left, right) => left - right);
  return { outcomes, median: times[Math.floor(times.length / 2)] };
}

async function reportMode(context: JobContext, model: string, history: Mode, fastModel: string) {
  const label = history ? `reply:${model}:${history}` : `reply:${model}`;
  const empty = { inputTokens: 0, cachedInputTokens: 0, microUsd: 0 };
  const before = { ...empty, ...context.meter.totals(label) };
  const { outcomes, median } = await runMode(
    context,
    { driver: context.driver, meter: context.meter, model, history },
    fastModel,
  );
  const after = { ...empty, ...context.meter.totals(label) };
  const report = scoreEval(context.cases, outcomes);
  const count = context.cases.length;
  const input = after.inputTokens - before.inputTokens;
  const cached = after.cachedInputTokens - before.cachedInputTokens;
  if (context.verbose)
    say(`missed: ${report.missedProductCaseIds}; wrong price: ${report.wrongPriceCaseIds}`);
  return [
    model,
    modeName(history),
    `${report.productFound}/${report.productCases}`,
    String(report.wrongPriceCaseIds.length),
    String(report.outOfStockOfferCaseIds.length),
    String(report.unneededHandoverCaseIds.length),
    String(Math.round(input / count)),
    `${Math.round((cached / Math.max(input, 1)) * 100)}%`,
    dollars(((after.microUsd - before.microUsd) / count) * 1000),
    `${median}ms`,
  ];
}

// Long chats read two ways: the conversation window, and the last 20 messages the agent read
// before it. Each row is one mode: recall, wrong prices, tokens, cost and time per reply.
export async function reportLongChats(context: JobContext, models: string[], fastModel: string) {
  const rows: string[][] = [];
  for (const model of models)
    for (const history of modes) rows.push(await reportMode(context, model, history, fastModel));
  printTable(
    `Long chats (${context.cases.length} cases, 30 to 70 turns each)`,
    [
      'model',
      'history',
      'recalled',
      'wrong price',
      'oos offers',
      'needless',
      'input tokens/reply',
      'cached',
      'per 1,000 chats',
      'median time',
    ],
    rows,
  );
}
