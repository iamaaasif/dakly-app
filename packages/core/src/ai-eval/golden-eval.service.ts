import { Inject, Injectable } from '@nestjs/common';

import { AiPracticeService } from '../ai-agent/ai-practice.service';
import { type EvalReport, scoreEval } from './eval-scoring';
import type { EvalOutcome, GoldenCase } from './golden-case';

export type EvalResponder = (golden: GoldenCase) => Promise<EvalOutcome>;

// A saved run replays recorded answers, so CI makes no model call.
export const replayResponder =
  (recorded: Readonly<Record<string, EvalOutcome>>): EvalResponder =>
  async (golden) => {
    const outcome = recorded[golden.id];
    if (!outcome) throw new Error(`No recorded outcome for golden case ${golden.id}`);
    return outcome;
  };

@Injectable()
export class GoldenEvalService {
  constructor(@Inject(AiPracticeService) private readonly practice: AiPracticeService) {}

  async run(cases: readonly GoldenCase[], respond: EvalResponder): Promise<EvalReport> {
    const outcomes: Record<string, EvalOutcome> = {};
    // One at a time: a store runs at most three model calls at once.
    for (const golden of cases) outcomes[golden.id] = await respond(golden);
    return scoreEval(cases, outcomes);
  }

  // Asks the real agent pipeline of the eval shop, which holds the catalog the cases assume.
  liveResponder(storeId: string): EvalResponder {
    return (golden) => this.practice.ask(storeId, golden.question);
  }
}
