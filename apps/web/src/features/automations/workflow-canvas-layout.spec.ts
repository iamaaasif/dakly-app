import { describe, expect, it } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { layoutWorkflow, TRIGGER_KEY } from './workflow-canvas-layout';

const base: Omit<AutomationGraph, 'firstStepKey' | 'steps'> = {
  trigger: { key: 'consent_given', filters: [] },
  reEntry: { rule: 'once' },
  workflowFilters: [],
  goal: null,
  exitConditions: [],
};

function overlap(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('layoutWorkflow', () => {
  it('numbers steps in reading order and leaves exits unnumbered', () => {
    const graph: AutomationGraph = {
      ...base,
      firstStepKey: 'pause',
      steps: {
        pause: { kind: 'wait', wait: { until: 'duration', minutes: 60 }, next: 'tag' },
        tag: { kind: 'action', action: { action: 'add_tag', tag: 'vip' }, next: 'end' },
        end: { kind: 'exit' },
      },
    };
    const { nodes, edges } = layoutWorkflow(graph);
    expect(nodes.map(({ key, number }) => [key, number])).toEqual([
      [TRIGGER_KEY, null],
      ['pause', 1],
      ['tag', 2],
      ['end', null],
    ]);
    expect(new Set(nodes.map(({ x, width }) => x + width / 2)).size).toBe(1);
    expect(edges).toHaveLength(3);
  });

  it('puts the paths of a split side by side and joins them below', () => {
    const graph: AutomationGraph = {
      ...base,
      firstStepKey: 'first',
      steps: {
        first: {
          kind: 'send',
          category: 'marketing',
          channels: ['sms'],
          message: { text: 'Hello', buttons: [] },
          ifNotReachable: 'skip',
          reviewBeforeSending: false,
          next: 'split',
        },
        split: {
          kind: 'condition',
          paths: [{ condition: { kind: 'tapped', stepKey: 'first' }, next: 'tagged' }],
          elseNext: 'pause',
        },
        tagged: { kind: 'action', action: { action: 'add_tag', tag: 'tapped' }, next: 'end' },
        pause: { kind: 'wait', wait: { until: 'duration', minutes: 1440 }, next: 'end' },
        end: { kind: 'exit' },
      },
    };
    const { nodes, edges } = layoutWorkflow(graph);
    const byKey = new Map(nodes.map((node) => [node.key, node]));
    expect(byKey.get('tagged')!.y).toBe(byKey.get('pause')!.y);
    expect(byKey.get('tagged')!.x).toBeLessThan(byKey.get('pause')!.x);
    expect(byKey.get('end')!.y).toBeGreaterThan(byKey.get('tagged')!.y);
    expect(edges.flatMap(({ label }) => label ?? [])).toEqual([
      'Tapped the link in step 1',
      'Else',
    ]);
    expect(byKey.get('split')!.branches).toEqual([
      'Tapped the link in step 1: step 3',
      'Else: step 4',
    ]);
  });

  it.each(Object.entries(automationTemplates))('draws every step of %s once', (_, template) => {
    const { nodes } = layoutWorkflow(template.graph);
    expect(nodes).toHaveLength(Object.keys(template.graph.steps).length + 1);
    for (const [index, node] of nodes.entries()) {
      for (const other of nodes.slice(index + 1)) expect(overlap(node, other)).toBe(false);
    }
  });
});
