import type { z } from 'zod';

import type { automationGraphSchema } from '@dakly/contracts/automations/graph';

export type SettingsInput = z.input<typeof automationGraphSchema>;

export function removesOwnTag(graph: Pick<SettingsInput, 'reEntry' | 'trigger' | 'steps'>) {
  if (graph.trigger.key !== 'tag_added' || graph.reEntry?.rule !== 'every_time') return false;
  const filter = graph.trigger.filters.find((item) => item.field === 'tag');
  return Object.values(graph.steps).some(
    (step) =>
      step.kind === 'action' &&
      step.action.action === 'remove_tag' &&
      step.action.tag === filter?.tag,
  );
}
