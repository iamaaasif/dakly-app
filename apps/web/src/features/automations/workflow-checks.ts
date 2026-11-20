import { type AutomationGraph, nextStepKeys } from '@dakly/contracts/automations/graph';

import { TRIGGER_KEY } from './workflow-canvas-layout';
import {
  insertDelay,
  PLACEHOLDER_MESSAGE,
  PLACEHOLDER_TAG,
  removeStep,
} from './workflow-graph-edit';

// Replies and taps need time to arrive before a split reads them.
const MIN_MINUTES_BEFORE_SPLIT = 120;
const MAX_UNREVIEWED_PERCENT = 20;

export type WorkflowCheck = {
  id: string;
  // A blocker stops Start workflow and Publish; a warning does not.
  level: 'block' | 'warn';
  message: string;
  fix?: { label: string; apply: (graph: AutomationGraph) => AutomationGraph };
};

type StepNumber = (key: string) => number;

function waitMinutes(graph: AutomationGraph, key: string) {
  const step = graph.steps[key]!;
  if (step.kind !== 'wait') return 0;
  if (step.wait.until === 'duration') return step.wait.minutes;
  return step.wait.until === 'event' ? step.wait.timeoutMinutes : 0;
}

// The shortest total wait on any path from one step to another, or Infinity when none leads there.
function shortestWait(graph: AutomationGraph, from: string, to: string) {
  const known = new Map<string, number>();
  function walk(key: string): number {
    if (key === to) return 0;
    const cached = known.get(key);
    if (cached !== undefined) return cached;
    const after = Math.min(Infinity, ...nextStepKeys(graph.steps[key]!).map(walk));
    known.set(key, waitMinutes(graph, key) + after);
    return known.get(key)!;
  }
  return walk(from);
}

function parentOf(graph: AutomationGraph, key: string) {
  if (graph.firstStepKey === key) return TRIGGER_KEY;
  return Object.keys(graph.steps).find((item) => nextStepKeys(graph.steps[item]!).includes(key))!;
}

function placeholderChecks(graph: AutomationGraph, stepNumber: StepNumber) {
  const checks: WorkflowCheck[] = [];
  for (const [key, step] of Object.entries(graph.steps)) {
    const unfinished =
      (step.kind === 'send' &&
        step.message.text === PLACEHOLDER_MESSAGE &&
        'has the sample message') ||
      (step.kind === 'action' &&
        step.action.action === 'add_tag' &&
        step.action.tag === PLACEHOLDER_TAG &&
        'has the sample tag');
    if (!unfinished) continue;
    checks.push({
      id: `unfinished:${key}`,
      level: 'block',
      message: `Step ${stepNumber(key)} ${unfinished}. Change it in the workflow settings, or delete the step.`,
      fix: { label: 'Delete step', apply: (current) => removeStep(current, key) },
    });
  }
  return checks;
}

function readKeys(step: AutomationGraph['steps'][string]) {
  if (step.kind === 'wait' && step.wait.until === 'event') return [step.wait.stepKey];
  if (step.kind !== 'condition') return [];
  return step.paths.flatMap(({ condition }) =>
    condition.kind === 'tapped' || condition.kind === 'replied' ? [condition.stepKey] : [],
  );
}

function splitChecks(graph: AutomationGraph, stepNumber: StepNumber) {
  const checks: WorkflowCheck[] = [];
  for (const [key, step] of Object.entries(graph.steps)) {
    const gaps = readKeys(step).map((sendKey) => shortestWait(graph, sendKey, key));
    if (gaps.includes(Infinity)) {
      checks.push({
        id: `read-order:${key}`,
        level: 'block',
        message: `Step ${stepNumber(key)} reads a tap or reply from a message that does not come before it. Move the message up or this step down.`,
      });
    } else if (step.kind === 'condition' && gaps.some((gap) => gap < MIN_MINUTES_BEFORE_SPLIT)) {
      checks.push({
        id: `split-wait:${key}`,
        level: 'block',
        message: `Step ${stepNumber(key)} reads a tap or reply with under 2 hours of waiting before it.`,
        fix: {
          label: 'Add a 2 hour wait',
          apply: (current) =>
            insertDelay(
              current,
              { parent: parentOf(current, key), target: key },
              MIN_MINUTES_BEFORE_SPLIT,
            ),
        },
      });
    }
  }
  return checks;
}

function warningChecks(graph: AutomationGraph, stepNumber: StepNumber) {
  const checks: WorkflowCheck[] = [];
  const first = graph.steps[graph.firstStepKey]!;
  if (first.kind === 'send' && first.category === 'marketing') {
    checks.push({
      id: 'marketing-first',
      level: 'warn',
      message:
        'A marketing message goes out the moment someone enters. A short wait first feels less pushy.',
      fix: {
        label: 'Add a 1 hour wait',
        apply: (current) =>
          insertDelay(current, { parent: TRIGGER_KEY, target: current.firstStepKey }, 60),
      },
    });
  }
  for (const [key, step] of Object.entries(graph.steps)) {
    const { action } = step.kind === 'action' ? step : { action: undefined };
    if (
      action?.action === 'give_coupon' &&
      action.discount.kind === 'percent' &&
      action.discount.percent > MAX_UNREVIEWED_PERCENT
    ) {
      checks.push({
        id: `big-offer:${key}`,
        level: 'warn',
        message: `Step ${stepNumber(key)} gives more than ${MAX_UNREVIEWED_PERCENT}% off.`,
      });
    }
  }
  return checks;
}

export function checkWorkflow(graph: AutomationGraph, stepNumber: StepNumber): WorkflowCheck[] {
  return [
    ...placeholderChecks(graph, stepNumber),
    ...splitChecks(graph, stepNumber),
    ...warningChecks(graph, stepNumber),
  ];
}
