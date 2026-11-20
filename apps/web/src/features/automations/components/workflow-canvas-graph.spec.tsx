// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import { layoutWorkflow } from '../workflow-canvas-layout';
import { WorkflowCanvasGraph } from './workflow-canvas-graph';

afterEach(cleanup);

const send: Omit<Extract<AutomationStep, { kind: 'send' }>, 'next'> = {
  kind: 'send',
  category: 'marketing',
  channels: ['sms', 'whatsapp'],
  message: { text: 'Urban Trend: {first_name}, your cart is waiting', buttons: [] },
  ifNotReachable: 'skip',
  reviewBeforeSending: false,
};

const graph: AutomationGraph = {
  trigger: { key: 'tag_added', filters: [{ field: 'tag', tag: 'vip' }] },
  reEntry: { rule: 'every_days', days: 7 },
  workflowFilters: [],
  goal: { kind: 'placed_order' },
  exitConditions: [],
  firstStepKey: 'pause',
  steps: {
    pause: { kind: 'wait', wait: { until: 'duration', minutes: 60 }, next: 'message' },
    message: { ...send, next: 'split' },
    split: {
      kind: 'condition',
      paths: [{ condition: { kind: 'tapped', stepKey: 'message' }, next: 'coupon' }],
      elseNext: 'dice',
    },
    coupon: {
      kind: 'action',
      action: { action: 'give_coupon', discount: { kind: 'percent', percent: 10 }, validDays: 3 },
      next: 'end',
    },
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

describe('WorkflowCanvasGraph', () => {
  it('shows the trigger, every kind of step and a number on each step', () => {
    render(<WorkflowCanvasGraph graph={graph} layout={layoutWorkflow(graph)} />);
    const steps = within(screen.getByRole('list', { name: 'Workflow steps' }));

    expect(steps.getByText('Trigger')).toBeTruthy();
    expect(steps.getByText('receive a tag')).toBeTruthy();
    expect(steps.getByText('Tag: vip')).toBeTruthy();
    expect(steps.getByText('Once every 7 days')).toBeTruthy();
    expect(steps.getByText('Places an order')).toBeTruthy();
    expect(steps.getByText('1 hour')).toBeTruthy();
    expect(steps.getByText('SMS / WhatsApp')).toBeTruthy();
    expect(steps.getByText(/your cart is waiting/)).toBeTruthy();
    expect(steps.getByText('Conditional split')).toBeTruthy();
    expect(steps.getByText('Give a coupon')).toBeTruthy();
    expect(steps.getByText('10% off, valid 3 days')).toBeTruthy();
    expect(steps.getByText('Random split')).toBeTruthy();
    expect(steps.getByText('Exit')).toBeTruthy();
    expect(steps.getAllByText('Step')).toHaveLength(5);
    expect(steps.getByText('Tapped the link in step 2: step 4')).toBeTruthy();
    expect(steps.getByText('Else: step 5')).toBeTruthy();
  });

  it('shows the recent entry count on the trigger card', () => {
    render(
      <WorkflowCanvasGraph graph={graph} layout={layoutWorkflow(graph)} recentEntries="3 people" />,
    );
    expect(screen.getByText('Last 7 days')).toBeTruthy();
    expect(screen.getByText('3 people')).toBeTruthy();
  });

  it('shows what happened at each step, with zero for steps nobody reached', () => {
    const stats = {
      message: { reached: 1200, sent: 1100, delivered: 1000, read: 0, tapped: 90 },
      pause: { reached: 1300, sent: 0, delivered: 0, read: 0, tapped: 0 },
    };
    render(<WorkflowCanvasGraph graph={graph} layout={layoutWorkflow(graph)} stats={stats} />);
    const steps = within(screen.getByRole('list', { name: 'Workflow steps' }));

    expect(steps.getByText(/^1,100 sent · 90 tapped/)).toBeTruthy();
    expect(steps.getByText(/^1,300 reached/)).toBeTruthy();
    expect(steps.getAllByText(/^0 reached/).length).toBeGreaterThan(0);
  });

  it('scales the drawing without changing its content', () => {
    const layout = layoutWorkflow(graph);
    const { container } = render(<WorkflowCanvasGraph graph={graph} layout={layout} scale={0.5} />);
    expect((container.firstChild as HTMLElement).style.width).toBe(`${layout.width / 2}px`);
  });
});
