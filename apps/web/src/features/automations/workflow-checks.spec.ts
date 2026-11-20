import { describe, expect, it } from 'vitest';

import { isTriggerAvailable } from '@dakly/contracts/automations/catalogue';
import { type AutomationGraph, automationGraphSchema } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { TRIGGER_KEY } from './workflow-canvas-layout';
import { checkWorkflow } from './workflow-checks';
import { appendStep, insertStep } from './workflow-graph-edit';

const template: AutomationGraph = automationTemplates.welcome_new_subscriber.graph;
const number = (key: string) => Object.keys(template.steps).indexOf(key) + 1;

function reread(): AutomationGraph {
  const send = Object.entries(template.steps).find(([, step]) => step.kind === 'send')!;
  return {
    ...template,
    firstStepKey: send[0],
    steps: {
      ...template.steps,
      split: {
        kind: 'condition',
        paths: [{ condition: { kind: 'tapped', stepKey: send[0] }, next: 'end' }],
        elseNext: 'end',
      },
      [send[0]]: { ...send[1], next: 'split' } as never,
    },
  };
}

describe('checkWorkflow', () => {
  it.each(
    Object.entries(automationTemplates).filter(([, item]) =>
      isTriggerAvailable(item.graph.trigger.key),
    ),
  )('has no blockers for the %s template', (_name, item) => {
    const graph: AutomationGraph = item.graph;
    const numberOf = (key: string) => Object.keys(graph.steps).indexOf(key) + 1;
    expect(checkWorkflow(graph, numberOf).filter((check) => check.level === 'block')).toEqual([]);
  });

  it('blocks a message step with no channel that can send yet', () => {
    const [key, step] = Object.entries(template.steps).find(([, item]) => item.kind === 'send')!;
    const graph = {
      ...template,
      steps: { ...template.steps, [key]: { ...step, channels: ['whatsapp'] } as never },
    };
    const checks = checkWorkflow(graph, number);
    expect(checks.find((check) => check.id === `no-channel:${key}`)?.level).toBe('block');
  });

  it('blocks a workflow whose trigger the shop cannot use yet', () => {
    const unavailable = Object.values(automationTemplates).find(
      (item) => !isTriggerAvailable(item.graph.trigger.key),
    )!;
    const checks = checkWorkflow(unavailable.graph, () => 1);
    expect(checks.map((check) => check.id)).toContain('trigger-unavailable');
  });

  it('blocks a split that reads a message which comes after it', () => {
    const send = Object.entries(template.steps).find(([, step]) => step.kind === 'send')!;
    const graph: AutomationGraph = {
      ...template,
      firstStepKey: 'split',
      steps: {
        split: {
          kind: 'condition',
          paths: [{ condition: { kind: 'tapped', stepKey: send[0] }, next: send[0] }],
          elseNext: send[0],
        },
        [send[0]]: { ...send[1], next: 'end' } as never,
        end: { kind: 'exit' },
      },
    };
    const ids = checkWorkflow(graph, number).map((check) => check.id);
    expect(ids).toContain('read-order:split');
  });

  it('blocks a new step until its sample text is changed, and offers to delete it', () => {
    const graph = appendStep(appendStep(template, 'sms'), 'tag');
    const blockers = checkWorkflow(graph, number).filter((check) => check.level === 'block');
    expect(blockers).toHaveLength(2);
    let fixed = graph;
    for (const blocker of blockers) fixed = blocker.fix!.apply(fixed);
    expect(checkWorkflow(fixed, number).filter((check) => check.level === 'block')).toEqual([]);
  });

  it('blocks a split that reads a tap straight after the message, and the fix clears it', () => {
    const graph = automationGraphSchema.parse(reread());
    const [blocker] = checkWorkflow(graph, number).filter((check) => check.level === 'block');
    expect(blocker?.id).toBe('split-wait:split');
    const fixed = blocker!.fix!.apply(graph);
    expect(automationGraphSchema.safeParse(fixed).success).toBe(true);
    expect(checkWorkflow(fixed, number).filter((check) => check.level === 'block')).toEqual([]);
  });

  it('warns about a marketing message right after the trigger and offers a wait', () => {
    const graph = insertStep(
      template,
      { parent: TRIGGER_KEY, target: template.firstStepKey },
      'sms',
    );
    const warning = checkWorkflow(graph, number).find((check) => check.id === 'marketing-first')!;
    const fixed = warning.fix!.apply(graph);
    expect(checkWorkflow(fixed, number).some((check) => check.id === 'marketing-first')).toBe(
      false,
    );
  });
});
