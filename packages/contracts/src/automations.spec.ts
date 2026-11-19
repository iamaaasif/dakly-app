import { describe, expect, it } from 'vitest';

import { createAutomationSchema } from './automations';
import { automationTemplates } from './automations/templates';

const welcome = automationTemplates.welcome_new_subscriber.graph;
const wait = (next: string) => ({ kind: 'wait', wait: { until: 'duration', minutes: 60 }, next });

describe('createAutomationSchema', () => {
  it.each([
    ['a path that loops', { first: wait('second'), second: wait('first') }],
    ['a path with no end', { first: wait('missing') }],
  ])('refuses a draft with %s', (_name, steps) => {
    const graph = { ...welcome, firstStepKey: 'first', steps };

    expect(createAutomationSchema.safeParse({ name: 'স্বাগতম', graph }).success).toBe(false);
  });

  it('requires either a graph or a template key', () => {
    const name = 'Welcome';
    const templateKey = 'welcome_new_subscriber';
    expect(createAutomationSchema.safeParse({ name, templateKey }).success).toBe(true);
    expect(createAutomationSchema.safeParse({ name, templateKey, graph: welcome }).success).toBe(
      false,
    );
    expect(createAutomationSchema.safeParse({ name }).success).toBe(false);
  });

  it('accepts a template graph', () => {
    expect(createAutomationSchema.safeParse({ name: 'স্বাগতম', graph: welcome }).success).toBe(true);
  });
});
