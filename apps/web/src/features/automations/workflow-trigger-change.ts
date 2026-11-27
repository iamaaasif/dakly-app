import {
  automationTriggers,
  isTriggerAvailable,
  orderTriggerKeys,
  type TriggerKey,
  triggerKeys,
} from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { usesOrderFields } from '@dakly/contracts/automations/text';

import { removeStep } from './workflow-graph-edit';

// A trigger that needs a filter the panel cannot fill in yet (a tag, a segment) is left out, so a
// new workflow never lands on a trigger that fails the contract.
export const pickableTriggers = triggerKeys.filter(
  (key) =>
    isTriggerAvailable(key) && !Object.values(automationTriggers[key].filters).includes('required'),
);

export type TriggerChange = {
  graph: AutomationGraph;
  // Steps the new trigger cannot run, already taken out of `graph`.
  orderDetailSteps: string[];
  replySteps: string[];
};

function isReply(step: AutomationGraph['steps'][string]) {
  return (
    step.kind === 'action' &&
    (step.action.action === 'reply_to_comment' || step.action.action === 'send_private_reply')
  );
}

function usesOrderDetails(step: AutomationGraph['steps'][string]) {
  return (
    step.kind === 'send' &&
    (usesOrderFields(step.message.text) || usesOrderFields(step.message.messengerText ?? ''))
  );
}

// Filters the new trigger has no use for are dropped. Steps it cannot run are removed, so the
// caller shows what goes before applying the change.
export function changeTrigger(graph: AutomationGraph, key: TriggerKey): TriggerChange {
  const allowed = automationTriggers[key].filters;
  const filters = graph.trigger.filters.filter((filter) => allowed[filter.field]);
  const entries = Object.entries(graph.steps);
  const replySteps = key === 'comment_on_post' ? [] : entries.filter(([, s]) => isReply(s));
  const orderDetailSteps = orderTriggerKeys.includes(key)
    ? []
    : entries.filter(([, step]) => usesOrderDetails(step));
  let next: AutomationGraph = { ...graph, trigger: { key, filters } };
  const removed = [...replySteps, ...orderDetailSteps].map(([stepKey]) => stepKey);
  for (const stepKey of removed) next = removeStep(next, stepKey);
  return {
    graph: next,
    orderDetailSteps: orderDetailSteps.map(([stepKey]) => stepKey),
    replySteps: replySteps.map(([stepKey]) => stepKey),
  };
}
