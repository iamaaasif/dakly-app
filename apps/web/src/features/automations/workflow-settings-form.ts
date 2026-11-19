import type { z } from 'zod';

import { createAutomationSchema } from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';

export const settingsSchema = createAutomationSchema.pick({ name: true, graph: true });
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

export const exitLabels = {
  placed_order: 'Customer places an order',
  order_confirmed: 'Order is confirmed',
  order_paid: 'Order is paid',
  order_cancelled: 'Order is cancelled',
  got_tag: 'Customer receives a tag',
  tapped_link: 'Customer taps a link',
  replied: 'Customer replies',
} satisfies Record<AutomationGraph['exitConditions'][number]['kind'], string>;

export const reEntryLabels = {
  once: 'Once ever',
  every_days: 'Once every few days',
  every_time: 'Every time',
} satisfies Record<AutomationGraph['reEntry']['rule'], string>;
