import type { AutomationGraph } from '@dakly/contracts/automations/graph';

type Filter = AutomationGraph['trigger']['filters'][number];
type Field = Filter['field'];

export function findFilter<Name extends Field>(
  graph: AutomationGraph,
  field: Name,
): Extract<Filter, { field: Name }> | undefined {
  return graph.trigger.filters.find(
    (filter): filter is Extract<Filter, { field: Name }> => filter.field === field,
  );
}

// An empty list means "no filter": the contract refuses a filter that matches nothing.
export function setFilter(graph: AutomationGraph, field: Field, filter: Filter | null) {
  const others = graph.trigger.filters.filter((item) => item.field !== field);
  const filters = filter ? [...others, filter] : others;
  return { ...graph, trigger: { ...graph.trigger, filters } };
}

const MAX_KEYWORD_LENGTH = 50;

// Splits typed or pasted text on commas and new lines, and drops words already in the list.
export function addKeywords(current: readonly string[], typed: string) {
  const seen = new Set(current.map((word) => word.toLowerCase()));
  const added: string[] = [];
  for (const piece of typed.split(/[,\n]/u)) {
    const word = piece.trim().slice(0, MAX_KEYWORD_LENGTH);
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    added.push(word);
  }
  return [...current, ...added];
}

export function toggleValue<Value>(values: readonly Value[], value: Value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
