import { isTriggerAvailable } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { automationTemplates, type TemplateKey } from '@dakly/contracts/automations/templates';

import { channelLabels } from './automation-labels';

export const templateTypeLabels = {
  transactional: 'Transactional',
  abandoned: 'Abandoned',
  welcome: 'Welcome',
  post_purchase: 'Post-purchase',
  win_back: 'Win back',
  special_occasion: 'Special occasions',
};

export const templateGoalLabels = {
  convert_subscribers: 'Convert subscribers',
  recover_sales: 'Recover lost sales',
  build_trust: 'Build trust',
  repeat_orders: 'Get repeat orders',
};

export function stepLabel(step: AutomationStep): string {
  if (step.kind === 'send') return step.channels.map((key) => channelLabels[key]).join(' / ');
  if (step.kind === 'wait') return waitLabel(step.wait);
  if (step.kind === 'condition' || step.kind === 'random_split') return 'Split';
  if (step.kind === 'action') return 'Action';
  return 'Exit';
}

export const minutesPerUnit = { minutes: 1, hours: 60, days: 1440 };
export type DelayUnit = keyof typeof minutesPerUnit;
export const delayUnits: DelayUnit[] = ['minutes', 'hours', 'days'];

export function delayUnit(minutes: number): DelayUnit {
  if (minutes % minutesPerUnit.days === 0) return 'days';
  if (minutes % minutesPerUnit.hours === 0) return 'hours';
  return 'minutes';
}

function waitLabel(wait: Extract<AutomationStep, { kind: 'wait' }>['wait']) {
  if (wait.until === 'time_of_day') return `Wait until ${wait.time}`;
  if (wait.until !== 'duration') return 'Wait';
  const unit = delayUnit(wait.minutes);
  const suffix = { minutes: ' min', hours: 'h', days: 'd' }[unit];
  return `Wait ${wait.minutes / minutesPerUnit[unit]}${suffix}`;
}

export const workflowTemplates = (Object.keys(automationTemplates) as TemplateKey[]).map((key) => {
  const template = automationTemplates[key];
  const steps = Object.values(template.graph.steps);
  const channels = [
    ...new Set(steps.flatMap((step) => (step.kind === 'send' ? step.channels : []))),
  ];
  return {
    ...template,
    key,
    channels,
    available: isTriggerAvailable(template.graph.trigger.key),
  };
});

export type WorkflowTemplateCard = (typeof workflowTemplates)[number];

export function templateRequirement(template: WorkflowTemplateCard) {
  const needs: readonly string[] = template.needs;
  if (needs.includes('channels')) return 'Needs a connected channel and the chat-start trigger';
  if (needs.includes('products')) return 'Needs product alerts and the back-in-stock trigger';
  if (needs.includes('orders')) return 'Needs order triggers';
  return 'Waiting for this trigger';
}

export const emptyWorkflow: AutomationGraph = {
  trigger: { key: 'consent_given', filters: [] },
  reEntry: { rule: 'every_days', days: 30 },
  workflowFilters: [],
  goal: null,
  exitConditions: [],
  firstStepKey: 'end',
  steps: { end: { kind: 'exit' } },
};
