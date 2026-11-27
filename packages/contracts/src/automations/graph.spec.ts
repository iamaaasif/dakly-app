import { describe, expect, it } from 'vitest';

import { isChannelSendable } from './catalogue';
import { automationGraphSchema } from './graph';
import { automationTemplates } from './templates';

const send = {
  kind: 'send',
  category: 'marketing',
  channels: ['sms'],
  message: { text: 'নুসরাত, নতুন কালেকশন এসেছে: {link}', buttons: [] },
  ifNotReachable: 'skip',
  reviewBeforeSending: false,
  next: 'end',
} as const;

function workflow(steps: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    trigger: { key: 'consent_given', filters: [] },
    reEntry: { rule: 'every_days', days: 30 },
    workflowFilters: [],
    goal: { kind: 'placed_order' },
    exitConditions: [],
    firstStepKey: 'start',
    steps,
    ...extra,
  };
}

function wait(minutes: number, next: string) {
  return { kind: 'wait', wait: { until: 'duration', minutes }, next };
}

function messages(result: ReturnType<typeof automationGraphSchema.safeParse>) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('automationGraphSchema', () => {
  it.each(Object.entries(automationTemplates))('accepts the %s template', (_key, template) => {
    expect(automationGraphSchema.parse(template.graph)).toEqual(template.graph);
  });

  it('uses Messenger buttons with an SMS link fallback in both COD confirmation steps', () => {
    const { steps } = automationTemplates.cod_order_confirmation.graph;
    for (const step of [steps.ask, steps.remind]) {
      expect(step).toMatchObject({
        channels: ['messenger', 'sms'],
        category: 'transactional',
        message: {
          text: expect.stringContaining('{confirm_link}'),
          messengerText: expect.stringContaining('{order_number}'),
          buttons: [
            { key: 'confirm', label: 'Confirm order' },
            { key: 'cancel', label: 'Cancel order' },
          ],
        },
      });
    }
  });

  it('accepts a random split whose paths add up to 100%', () => {
    const graph = workflow({
      start: {
        kind: 'random_split',
        paths: [
          { percent: 50, next: 'a' },
          { percent: 30, next: 'b' },
          { percent: 20, next: 'end' },
        ],
      },
      a: send,
      b: { ...send, channels: ['whatsapp', 'sms'] },
      end: { kind: 'exit' },
    });
    expect(automationGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('rejects a path that loops back to an earlier step', () => {
    const graph = workflow({
      start: wait(60, 'message'),
      message: { ...send, next: 'start' },
    });
    expect(messages(automationGraphSchema.safeParse(graph))).toContain(
      'A path loops back to an earlier step',
    );
  });

  it('rejects a loop through the else path of a condition', () => {
    const graph = workflow({
      start: send,
      end: {
        kind: 'condition',
        paths: [{ condition: { kind: 'tapped', stepKey: 'start' }, next: 'done' }],
        elseNext: 'start',
      },
      done: { kind: 'exit' },
    });
    expect(automationGraphSchema.safeParse(graph).success).toBe(false);
  });

  it('rejects a step that leads nowhere', () => {
    const graph = workflow({ start: wait(60, 'message'), message: send });
    expect(messages(automationGraphSchema.safeParse(graph))).toContain(
      'Step message leads to end, which does not exist',
    );
  });

  it('rejects a graph whose first step does not exist', () => {
    const graph = workflow({ end: { kind: 'exit' } });
    expect(messages(automationGraphSchema.safeParse(graph))).toContain(
      'The first step does not exist',
    );
  });

  it('rejects an unknown step kind', () => {
    const graph = workflow({
      start: { kind: 'call_customer', next: 'end' },
      end: { kind: 'exit' },
    });
    expect(automationGraphSchema.safeParse(graph).success).toBe(false);
  });

  it('allows 50 steps and rejects 51', () => {
    const chain = (count: number) => {
      const keys = Array.from({ length: count }, (_, index) => (index ? `step_${index}` : 'start'));
      const steps = keys.map((key, index) => {
        const next = keys[index + 1];
        return [key, next ? wait(1, next) : { kind: 'exit' }];
      });
      return workflow(Object.fromEntries(steps));
    };
    expect(automationGraphSchema.safeParse(chain(50)).success).toBe(true);
    expect(messages(automationGraphSchema.safeParse(chain(51)))).toContain(
      'A workflow has at most 50 steps',
    );
  });

  it('allows 90 days of waiting on a path and rejects more', () => {
    const graph = (lastWaitDays: number) =>
      workflow({
        start: wait(60 * 24 * 60, 'message'),
        message: { ...send, next: 'later' },
        later: wait(lastWaitDays * 24 * 60, 'end'),
        end: { kind: 'exit' },
      });
    expect(automationGraphSchema.safeParse(graph(30)).success).toBe(true);
    expect(messages(automationGraphSchema.safeParse(graph(31)))).toContain(
      'A path waits more than 90 days',
    );
  });

  it('counts the timeout of a wait for a reply towards the 90 days', () => {
    const graph = workflow({
      start: { ...send, next: 'reply' },
      reply: {
        kind: 'wait',
        wait: { until: 'event', event: 'replied', stepKey: 'start', timeoutMinutes: 89 * 24 * 60 },
        next: 'pause',
      },
      pause: wait(2 * 24 * 60, 'end'),
      end: { kind: 'exit' },
    });
    expect(messages(automationGraphSchema.safeParse(graph))).toContain(
      'A path waits more than 90 days',
    );
  });

  it('allows 5 exit conditions and rejects 6', () => {
    const steps = { start: send, end: { kind: 'exit' } };
    const exits = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ kind: 'got_tag', tag: `ট্যাগ ${index}` }));
    const withExits = (count: number) => workflow(steps, { exitConditions: exits(count) });
    expect(automationGraphSchema.safeParse(withExits(5)).success).toBe(true);
    expect(automationGraphSchema.safeParse(withExits(6)).success).toBe(false);
  });

  it('allows 10 condition paths plus else and rejects 11', () => {
    const split = (count: number) =>
      workflow({
        start: {
          kind: 'condition',
          paths: Array.from({ length: count }, () => ({
            condition: { kind: 'placed_order' },
            next: 'end',
          })),
          elseNext: 'end',
        },
        end: { kind: 'exit' },
      });
    expect(automationGraphSchema.safeParse(split(10)).success).toBe(true);
    expect(automationGraphSchema.safeParse(split(11)).success).toBe(false);
  });

  it('allows 4 random paths and rejects 5', () => {
    const split = (count: number) =>
      workflow({
        start: {
          kind: 'random_split',
          paths: Array.from({ length: count }, () => ({ percent: 100 / count, next: 'end' })),
        },
        end: { kind: 'exit' },
      });
    expect(automationGraphSchema.safeParse(split(4)).success).toBe(true);
    expect(automationGraphSchema.safeParse(split(5)).success).toBe(false);
  });

  it('rejects random paths that do not add up to 100%', () => {
    const graph = workflow({
      start: {
        kind: 'random_split',
        paths: [
          { percent: 50, next: 'end' },
          { percent: 40, next: 'end' },
        ],
      },
      end: { kind: 'exit' },
    });
    expect(messages(automationGraphSchema.safeParse(graph))).toContain(
      'Random paths must add up to 100%',
    );
  });

  it('rejects a condition on taps from a step that is not a send step', () => {
    const graph = workflow({
      start: wait(60, 'check'),
      check: {
        kind: 'condition',
        paths: [{ condition: { kind: 'tapped', stepKey: 'start' }, next: 'end' }],
        elseNext: 'end',
      },
      end: { kind: 'exit' },
    });
    expect(messages(automationGraphSchema.safeParse(graph))).toContain(
      'Step check reads start, which is not a send step',
    );
  });

  it('rejects a trigger filter the trigger does not have and a missing required filter', () => {
    const steps = { start: send, end: { kind: 'exit' } };
    const wrongFilter = workflow(steps, {
      trigger: { key: 'consent_given', filters: [{ field: 'first_order' }] },
    });
    const missingFilter = workflow(steps, { trigger: { key: 'tag_added', filters: [] } });
    expect(messages(automationGraphSchema.safeParse(wrongFilter))).toContain(
      'consent_given has no first_order filter',
    );
    expect(messages(automationGraphSchema.safeParse(missingFilter))).toContain(
      'tag_added needs a tag filter',
    );
  });

  it('rejects a send step that lists a channel twice', () => {
    const graph = workflow({ start: { ...send, channels: ['sms', 'sms'] }, end: { kind: 'exit' } });
    expect(automationGraphSchema.safeParse(graph).success).toBe(false);
  });

  it('accepts Instagram as a send channel and as a reachable condition', () => {
    const graph = workflow({
      start: { ...send, channels: ['messenger', 'instagram', 'sms'] },
      end: { kind: 'exit' },
    });
    expect(automationGraphSchema.safeParse(graph).success).toBe(true);
    expect(isChannelSendable('instagram')).toBe(true);
  });

  it('accepts order fields only when an order starts the workflow', () => {
    const steps = {
      start: {
        ...send,
        category: 'transactional',
        message: { text: 'অর্ডার {order_number}', buttons: [] },
      },
      end: { kind: 'exit' },
    };
    expect(messages(automationGraphSchema.safeParse(workflow(steps)))).toEqual([
      'Order fields need a trigger that starts from an order',
    ]);
    const fromOrder = workflow(steps, { trigger: { key: 'order_placed', filters: [] } });
    expect(automationGraphSchema.safeParse(fromOrder).success).toBe(true);
  });
  describe('message_received trigger', () => {
    const trigger = (filters: unknown[]) => ({ key: 'message_received', filters });
    const parse = (filters: unknown[]) =>
      automationGraphSchema.safeParse(
        workflow({ start: send, end: { kind: 'exit' } }, { trigger: trigger(filters) }),
      );

    it('accepts channel, intent and keyword filters together', () => {
      const result = parse([
        { field: 'channel', channels: ['messenger', 'instagram'] },
        { field: 'intent', intents: ['price', 'size_or_stock'] },
        { field: 'keywords', keywords: ['দাম', 'dam koto', 'price', 'pp'] },
      ]);
      expect(messages(result)).toEqual([]);
    });

    it('accepts no filters', () => {
      expect(messages(parse([]))).toEqual([]);
    });

    it('rejects an unknown intent and empty keyword lists', () => {
      expect(parse([{ field: 'intent', intents: ['spam'] }]).success).toBe(false);
      expect(parse([{ field: 'intent', intents: [] }]).success).toBe(false);
      expect(parse([{ field: 'keywords', keywords: [] }]).success).toBe(false);
      expect(parse([{ field: 'keywords', keywords: ['   '] }]).success).toBe(false);
    });

    it('rejects a filter the trigger does not have', () => {
      expect(messages(parse([{ field: 'tag', tag: 'vip' }]))).toContain(
        'message_received has no tag filter',
      );
    });

    it('rejects intent and keyword filters on other triggers', () => {
      const result = automationGraphSchema.safeParse(
        workflow(
          { start: send, end: { kind: 'exit' } },
          {
            trigger: { key: 'consent_given', filters: [{ field: 'keywords', keywords: ['dam'] }] },
          },
        ),
      );
      expect(messages(result)).toContain('consent_given has no keywords filter');
    });
  });
});
