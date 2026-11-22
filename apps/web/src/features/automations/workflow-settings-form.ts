import type { AutomationGraph } from '@dakly/contracts/automations/graph';

export function removesOwnTag(graph: Pick<AutomationGraph, 'reEntry' | 'trigger' | 'steps'>) {
  if (graph.trigger.key !== 'tag_added' || graph.reEntry.rule !== 'every_time') return false;
  const filter = graph.trigger.filters.find((item) => item.field === 'tag');
  return Object.values(graph.steps).some(
    (step) =>
      step.kind === 'action' &&
      step.action.action === 'remove_tag' &&
      step.action.tag === filter?.tag,
  );
}
