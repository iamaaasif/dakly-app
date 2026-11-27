import { describe, expect, it } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
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

// The up and down parts of an edge path, which is made of M, V and H commands.
function verticalLines(path: string) {
  const lines: { x: number; from: number; to: number }[] = [];
  let x = 0;
  let y = 0;
  for (const [, command, first, second] of path.matchAll(/([MVH])([\d.]+)(?: ([\d.]+))?/g)) {
    if (command === 'M') [x, y] = [Number(first), Number(second)];
    if (command === 'H') x = Number(first);
    if (command === 'V') {
      lines.push({ x, from: y, to: Number(first) });
      y = Number(first);
    }
  }
  return lines;
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
    expect(edges.flatMap(({ label }) => label ?? [])).toEqual(['Yes', 'No']);
    expect(byKey.get('split')!.branches).toEqual(['Yes: step 3', 'No: step 4']);
  });

  it.each(Object.entries(automationTemplates))('draws every step of %s once', (_, template) => {
    const { nodes } = layoutWorkflow(template.graph);
    expect(nodes).toHaveLength(Object.keys(template.graph.steps).length + 1);
    for (const [index, node] of nodes.entries()) {
      for (const other of nodes.slice(index + 1)) expect(overlap(node, other)).toBe(false);
    }
  });

  it('keeps the line of a skipping path out of the cards it passes', () => {
    const wait = (next: string): AutomationStep => ({
      kind: 'wait',
      wait: { until: 'duration', minutes: 60 },
      next,
    });
    const graph: AutomationGraph = {
      ...base,
      firstStepKey: 'split',
      steps: {
        split: {
          kind: 'condition',
          paths: [{ condition: { kind: 'has_tag', tag: 'vip' }, next: 'one' }],
          elseNext: 'end',
        },
        one: wait('two'),
        two: wait('three'),
        three: wait('end'),
        end: { kind: 'exit' },
      },
    };
    const { nodes, edges } = layoutWorkflow(graph);
    const skipping = edges.find(({ label }) => label === 'No')!;
    const lines = verticalLines(skipping.path);
    expect(lines.length).toBeGreaterThan(2);
    for (const node of nodes) {
      for (const line of lines) {
        const inside = node.x < line.x && line.x < node.x + node.width;
        const along =
          Math.min(line.from, line.to) < node.y + node.height &&
          node.y < Math.max(line.from, line.to);
        expect(inside && along).toBe(false);
      }
    }
  });

  it('draws two paths to the same step as one labelled line', () => {
    const graph: AutomationGraph = {
      ...base,
      firstStepKey: 'dice',
      steps: {
        dice: {
          kind: 'random_split',
          paths: [
            { percent: 50, next: 'end' },
            { percent: 50, next: 'end' },
          ],
        },
        end: { kind: 'exit' },
      },
    };
    const { edges } = layoutWorkflow(graph);
    expect(edges.map(({ label }) => label)).toEqual([undefined, '50% + 50%']);
  });
});
