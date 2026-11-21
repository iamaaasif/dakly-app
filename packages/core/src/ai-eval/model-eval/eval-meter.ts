import { costMicroUsd } from './candidate-prices';

type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

export type MeterTotals = {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  microUsd: number;
};

// One meter per run: it adds up cost and stops the run before the spend limit is passed.
export class EvalMeter {
  private spentMicroUsd = 0;
  private readonly byLabel = new Map<string, MeterTotals>();

  constructor(private readonly limitMicroUsd: number) {}

  record(label: string, model: string, usage: Usage) {
    this.add(label, costMicroUsd(model, usage), usage);
  }

  // For a call billed by something other than tokens, such as minutes of audio.
  recordFlat(label: string, microUsd: number) {
    this.add(label, microUsd, { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  }

  totals(label: string): MeterTotals | undefined {
    return this.byLabel.get(label);
  }

  get spentUsd() {
    return this.spentMicroUsd / 1e6;
  }

  private add(label: string, microUsd: number, usage: Usage) {
    this.spentMicroUsd += microUsd;
    const totals = this.byLabel.get(label) ?? {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      microUsd: 0,
    };
    totals.calls += 1;
    totals.inputTokens += usage.inputTokens;
    totals.cachedInputTokens += usage.cachedInputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.microUsd += microUsd;
    this.byLabel.set(label, totals);
    if (this.spentMicroUsd > this.limitMicroUsd)
      throw new Error(`Spend limit reached at $${this.spentUsd.toFixed(2)}`);
  }
}
