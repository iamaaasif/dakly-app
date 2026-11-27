import { describe, expect, it } from 'vitest';

import { automationGraphSchema } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { emptyWorkflow } from './workflow-library';
import { changeTrigger, pickableTriggers } from './workflow-trigger-change';

describe('changeTrigger', () => {
  it('offers comment, message, order and consent triggers but not ones that need a tag first', () => {
    expect(pickableTriggers).toContain('comment_on_post');
    expect(pickableTriggers).toContain('message_received');
    expect(pickableTriggers).toContain('order_placed');
    expect(pickableTriggers).not.toContain('tag_added');
    expect(pickableTriggers).not.toContain('product_viewed');
  });

  it('switches an empty workflow to every pickable trigger and stays valid', () => {
    for (const key of pickableTriggers) {
      const { graph } = changeTrigger(emptyWorkflow, key);
      expect(graph.trigger.key).toBe(key);
      expect(automationGraphSchema.safeParse(graph).success).toBe(true);
    }
  });

  it('keeps filters the new trigger shares and drops the rest', () => {
    const start = automationTemplates.order_intent_follow_up.graph;
    const { graph } = changeTrigger(
      {
        ...start,
        trigger: {
          key: 'message_received',
          filters: [
            { field: 'keywords', keywords: ['dam'] },
            { field: 'intent', intents: ['price'] },
          ],
        },
      },
      'comment_on_post',
    );
    expect(graph.trigger.filters).toEqual([{ field: 'keywords', keywords: ['dam'] }]);
  });

  it('removes comment replies when leaving a comment trigger', () => {
    const start = Object.values(automationTemplates).find(
      (template) => template.graph.trigger.key === 'comment_on_post',
    )!.graph;
    const change = changeTrigger(start, 'message_received');
    expect(change.replySteps.length).toBeGreaterThan(0);
    expect(automationGraphSchema.safeParse(change.graph).success).toBe(true);
  });
});
