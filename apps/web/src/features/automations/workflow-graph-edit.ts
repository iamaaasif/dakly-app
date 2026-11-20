import {
  type AutomationGraph,
  type AutomationStep,
  MAX_WORKFLOW_STEPS,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';

import { TRIGGER_KEY } from './workflow-canvas-layout';

export type NewStepKind = 'sms' | 'whatsapp' | 'delay' | 'tag' | 'split';

type Steps = AutomationGraph['steps'];

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
        message: { text: 'Hi {first_name}, thank you for shopping with us.', buttons: [] },
        ifNotReachable: 'skip',
        reviewBeforeSending: false,
        next,
      };
    case 'delay':
      return { kind: 'wait', wait: { until: 'duration', minutes: 24 * 60 }, next };
    case 'tag':
      return { kind: 'action', action: { action: 'add_tag', tag: 'new_tag' }, next };
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
