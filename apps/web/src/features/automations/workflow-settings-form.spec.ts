import { describe, expect, it } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import { removesOwnTag } from './workflow-settings-form';

describe('workflow entry warning', () => {
  const graph: AutomationGraph = {
    trigger: { key: 'tag_added', filters: [{ field: 'tag', tag: 'vip' }] },
    reEntry: { rule: 'every_time' },
    workflowFilters: [],
    goal: null,
    exitConditions: [],
    firstStepKey: 'remove',
    steps: {
      remove: { kind: 'action', action: { action: 'remove_tag', tag: 'vip' }, next: 'end' },
      end: { kind: 'exit' },
    },
  };

  it('warns when the workflow can be restarted by adding the tag it removes', () => {
    expect(removesOwnTag(graph)).toBe(true);
    expect(removesOwnTag({ ...graph, reEntry: { rule: 'once' } })).toBe(false);
    expect(
      removesOwnTag({
        ...graph,
        trigger: { key: 'tag_added', filters: [{ field: 'tag', tag: 'new' }] },
      }),
    ).toBe(false);
  });
});
