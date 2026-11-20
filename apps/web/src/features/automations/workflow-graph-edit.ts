import {
  type AutomationGraph,
  type AutomationStep,
  MAX_WORKFLOW_STEPS,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';

import { TRIGGER_KEY } from './workflow-canvas-layout';

export type NewStepKind = 'sms' | 'whatsapp' | 'delay' | 'tag' | 'split';

type Steps = AutomationGraph['steps'];

// New steps start with these. They are valid so a draft saves, but a workflow does not start
// while a step still has them.
export const PLACEHOLDER_MESSAGE = 'Hi {first_name}, thank you for shopping with us.';
export const PLACEHOLDER_TAG = 'new_tag';

// Every new step passes the contract, so a person can save at once and then edit the details in
// the workflow settings.
function newStep(kind: NewStepKind, next: string): AutomationStep {
  switch (kind) {
    case 'sms':
    case 'whatsapp':
      return {
        kind: 'send',
        category: 'marketing',
        channels: [kind],
        message: { text: PLACEHOLDER_MESSAGE, buttons: [] },
        ifNotReachable: 'skip',
        reviewBeforeSending: false,
        next,
      };
    case 'delay':
      return { kind: 'wait', wait: { until: 'duration', minutes: 24 * 60 }, next };
    case 'tag':
      return { kind: 'action', action: { action: 'add_tag', tag: PLACEHOLDER_TAG }, next };
    case 'split':
      return {
        kind: 'condition',
        paths: [{ condition: { kind: 'placed_order' }, next }],
        elseNext: next,
      };
  }
}

function freshKey(kind: NewStepKind, steps: Steps) {
  for (let number = 1; ; number += 1) {
    const key = `${kind}_${number}`;
    if (!Object.hasOwn(steps, key)) return key;
  }
}

function redirect(step: AutomationStep, from: string, to: string): AutomationStep {
  const swap = (key: string) => (key === from ? to : key);
  if (step.kind === 'exit') return step;
  if (step.kind === 'condition') {
    return {
      ...step,
      paths: step.paths.map((path) => ({ ...path, next: swap(path.next) })),
      elseNext: swap(step.elseNext),
    };
  }
  if (step.kind === 'random_split') {
    return { ...step, paths: step.paths.map((path) => ({ ...path, next: swap(path.next) })) };
  }
  return { ...step, next: swap(step.next) };
}

function redirectParents(graph: AutomationGraph, from: string, to: string): AutomationGraph {
  const steps = Object.fromEntries(
    Object.entries(graph.steps).map(([key, step]) => [key, redirect(step, from, to)]),
  );
  return { ...graph, firstStepKey: graph.firstStepKey === from ? to : graph.firstStepKey, steps };
}

export function canAddStep(graph: AutomationGraph) {
  return Object.keys(graph.steps).length < MAX_WORKFLOW_STEPS;
}

// Puts a step on the line from `parent` (the trigger or a step) to `target`. Every path of the
// parent that led to the target now goes through the new step.
export function insertStep(
  graph: AutomationGraph,
  { parent, target }: { parent: string; target: string },
  kind: NewStepKind,
) {
  const key = freshKey(kind, graph.steps);
  const steps = { ...graph.steps, [key]: newStep(kind, target) };
  if (parent === TRIGGER_KEY) return { ...graph, firstStepKey: key, steps };
  return { ...graph, steps: { ...steps, [parent]: redirect(steps[parent]!, target, key) } };
}

export function insertDelay(
  graph: AutomationGraph,
  edge: { parent: string; target: string },
  minutes: number,
) {
  const next = insertStep(graph, edge, 'delay');
  const key = Object.keys(next.steps).find((item) => !Object.hasOwn(graph.steps, item))!;
  const step = next.steps[key]!;
  if (step.kind !== 'wait') return next;
  return {
    ...next,
    steps: { ...next.steps, [key]: { ...step, wait: { until: 'duration' as const, minutes } } },
  };
}

// The palette adds to the end of the main flow, just before the last exit that is reached.
export function appendStep(graph: AutomationGraph, kind: NewStepKind) {
  const exits = Object.keys(graph.steps).filter((key) => graph.steps[key]!.kind === 'exit');
  const exit = exits.at(-1)!;
  const parent =
    Object.keys(graph.steps).find((key) => nextStepKeys(graph.steps[key]!).includes(exit)) ??
    TRIGGER_KEY;
  return insertStep(graph, { parent, target: exit }, kind);
}

function dropUnreachable(graph: AutomationGraph): AutomationGraph {
  const reached = new Set<string>();
  const visit = (key: string) => {
    if (reached.has(key)) return;
    reached.add(key);
    nextStepKeys(graph.steps[key]!).forEach(visit);
  };
  visit(graph.firstStepKey);
  const steps = Object.fromEntries(Object.entries(graph.steps).filter(([key]) => reached.has(key)));
  return { ...graph, steps };
}

// The step's parents skip over it. A split keeps only its else path; the others are dropped.
export function removeStep(graph: AutomationGraph, key: string) {
  const step = graph.steps[key]!;
  if (step.kind === 'exit') return graph;
  return dropUnreachable(redirectParents(graph, key, nextStepKeys(step).at(-1)!));
}

function parentsOf(graph: AutomationGraph, key: string) {
  return Object.keys(graph.steps).filter((item) => nextStepKeys(graph.steps[item]!).includes(key));
}

function singleNext(step: AutomationStep | undefined) {
  return step && (step.kind === 'wait' || step.kind === 'send' || step.kind === 'action')
    ? step
    : undefined;
}

// Swaps a step with the one after it. Only plain steps with one way on can swap, and the step
// after must have no other way in, or people on another path would meet the moved step.
function swapWithNext(graph: AutomationGraph, key: string) {
  const step = singleNext(graph.steps[key]);
  const other = step && singleNext(graph.steps[step.next]);
  if (!step || !other || parentsOf(graph, step.next).length !== 1) return undefined;
  const moved = redirectParents(graph, key, step.next);
  const steps = {
    ...moved.steps,
    [step.next]: { ...other, next: key },
    [key]: { ...step, next: other.next },
  };
  return { ...moved, steps };
}

export function moveStep(graph: AutomationGraph, key: string, direction: 'up' | 'down') {
  if (direction === 'down') return swapWithNext(graph, key);
  const parents = parentsOf(graph, key);
  return parents.length === 1 ? swapWithNext(graph, parents[0]!) : undefined;
}
