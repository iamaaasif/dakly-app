import { describe, expect, it } from 'vitest';

import {
  type AutomationGraph,
  automationGraphSchema,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { TRIGGER_KEY } from './workflow-canvas-layout';
import { appendStep, insertStep, moveStep, removeStep } from './workflow-graph-edit';

const cart: AutomationGraph = automationTemplates.welcome_new_subscriber.graph;

function pathFrom(graph: AutomationGraph) {
  const kinds: string[] = [];
  for (let key = graph.firstStepKey; ; key = nextStepKeys(graph.steps[key]!)[0]!) {
    kinds.push(graph.steps[key]!.kind);
    if (graph.steps[key]!.kind === 'exit') return kinds;
  }
}

describe('editing a workflow graph', () => {
  it('adds every kind of step on the line after the trigger and stays valid', () => {
    for (const kind of ['sms', 'whatsapp', 'delay', 'tag', 'split'] as const) {
      const graph = insertStep(cart, { parent: TRIGGER_KEY, target: cart.firstStepKey }, kind);
      expect(automationGraphSchema.safeParse(graph).success).toBe(true);
      expect(graph.firstStepKey).not.toBe(cart.firstStepKey);
    }
  });

  it('puts a step between two steps and keeps the rest of the flow', () => {
    const [first] = Object.keys(cart.steps);
    const next = nextStepKeys(cart.steps[first!]!)[0]!;
    const graph = insertStep(cart, { parent: first!, target: next }, 'delay');
    expect(pathFrom(graph)).toHaveLength(pathFrom(cart).length + 1);
  });

  it('adds to the end, just before the exit', () => {
    const graph = appendStep(cart, 'tag');
    const kinds = pathFrom(graph);
    expect(kinds.slice(-2)).toEqual(['action', 'exit']);
    expect(automationGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('deletes a step and joins the steps around it', () => {
    const wait = Object.keys(cart.steps).find((key) => cart.steps[key]!.kind === 'wait')!;
    const graph = removeStep(cart, wait);
    expect(graph.steps[wait]).toBeUndefined();
    expect(pathFrom(graph)).toHaveLength(pathFrom(cart).length - 1);
    expect(automationGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('deleting a split keeps its else path and drops the other paths', () => {
    const split = insertStep(
      appendStep(cart, 'sms'),
      { parent: TRIGGER_KEY, target: cart.firstStepKey },
      'split',
    );
    const key = split.firstStepKey;
    const graph = removeStep(split, key);
    expect(graph.firstStepKey).toBe(cart.firstStepKey);
    expect(graph.steps[key]).toBeUndefined();
  });

  it('keeps the exit when asked to delete it', () => {
    const exit = Object.keys(cart.steps).find((key) => cart.steps[key]!.kind === 'exit')!;
    expect(removeStep(cart, exit)).toBe(cart);
  });
});

describe('moving a step', () => {
  const kindsAlong = (graph: AutomationGraph) => pathFrom(graph);

  it('moves a step down and up again to where it was', () => {
    const down = moveStep(cart, cart.firstStepKey, 'down')!;
    expect(automationGraphSchema.safeParse(down).success).toBe(true);
    expect(kindsAlong(down)).toEqual(['wait', 'send', 'send', 'exit']);
    const back = moveStep(down, cart.firstStepKey, 'up')!;
    expect(back).toEqual(cart);
  });

  it('does not move the first step up, the last step down, or a step past an exit', () => {
    expect(moveStep(cart, cart.firstStepKey, 'up')).toBeUndefined();
    const last = Object.keys(cart.steps).find(
      (key) => nextStepKeys(cart.steps[key]!)[0] === 'end',
    )!;
    expect(moveStep(cart, last, 'down')).toBeUndefined();
  });

  it('does not move a step into a path that others also take', () => {
    const split = insertStep(cart, { parent: TRIGGER_KEY, target: cart.firstStepKey }, 'split');
    expect(moveStep(split, split.firstStepKey, 'down')).toBeUndefined();
    expect(moveStep(split, cart.firstStepKey, 'up')).toBeUndefined();
  });
});

describe('the canvas and the settings form', () => {
  // The form saves what automationGraphSchema parses; the canvas edits the same shape.
  it.each(Object.entries(automationTemplates))(
    'leave the %s template unchanged by an edit and its undo',
    (_name, template) => {
      const graph: AutomationGraph = template.graph;
      const saved = automationGraphSchema.parse(graph);
      const edited = removeStep(
        insertStep(saved, { parent: TRIGGER_KEY, target: saved.firstStepKey }, 'delay'),
        'delay_1',
      );
      expect(edited).toEqual(saved);
      expect(automationGraphSchema.parse(edited)).toEqual(saved);
    },
  );
});
