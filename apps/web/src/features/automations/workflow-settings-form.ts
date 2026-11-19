import type { z } from 'zod';

import { automationDraftSchema } from '@dakly/contracts/automations';

export const settingsSchema = automationDraftSchema;
export type SettingsInput = z.input<typeof settingsSchema>;
export type SettingsValues = z.output<typeof settingsSchema>;

export function removesOwnTag(graph: SettingsInput['graph']) {
  if (graph.trigger.key !== 'tag_added' || graph.reEntry?.rule !== 'every_time') return false;
  const filter = graph.trigger.filters.find((item) => item.field === 'tag');
  return Object.values(graph.steps).some(
    (step) =>
      step.kind === 'action' &&
      step.action.action === 'remove_tag' &&
      step.action.tag === filter?.tag,
  );
}
