import { describe, expect, it } from 'vitest';

import { createAutomationSchema } from '@dakly/contracts/automations';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';

const welcome = automationTemplates.welcome_new_subscriber.graph;
const wait = (next: string) => ({ kind: 'wait', wait: { until: 'duration', minutes: 60 }, next });

describe('AutomationsController draft body', () => {
  it.each([
    ['a path that loops', { first: wait('second'), second: wait('first') }],
    ['a path with no end', { first: wait('missing') }],
  ])('refuses %s as a validation failure', (_name, steps) => {
    const graph = { ...welcome, firstStepKey: 'first', steps };

    expect(() =>
      new ZodValidationPipe(createAutomationSchema).transform({ name: 'স্বাগতম', graph }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', status: 400 }));
  });
});
