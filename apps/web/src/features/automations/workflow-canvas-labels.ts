import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import type { CampaignChannel } from '@dakly/contracts/campaigns';
import { formatMoney } from '@dakly/contracts/money';

import { channelLabels } from './automation-labels';
import { delayUnit, minutesPerUnit } from './workflow-library';
import { pluralize } from '@/lib/pluralize';

type Condition = AutomationGraph['workflowFilters'][number];
type ExitCondition = NonNullable<AutomationGraph['goal']>;
type TriggerFilter = AutomationGraph['trigger']['filters'][number];
type WaitStep = Extract<AutomationStep, { kind: 'wait' }>['wait'];
type ActionStep = Extract<AutomationStep, { kind: 'action' }>['action'];

function weekdayName(day: string) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function words(value: string) {
  return value.replaceAll('_', ' ');
}

function durationLabel(minutes: number) {
  const unit = delayUnit(minutes);
  return pluralize(minutes / minutesPerUnit[unit], unit.slice(0, -1));
}

// The second part is the amount, which the card shows in bold.
export function waitParts(wait: WaitStep): [string, string] {
  if (wait.until === 'duration') return ['Wait for', durationLabel(wait.minutes)];
  if (wait.until === 'time_of_day') return ['Wait until', wait.time];
  if (wait.until === 'weekday') return ['Wait until', `${weekdayName(wait.weekday)} ${wait.time}`];
  if (wait.until === 'event') {
    const event = wait.event === 'replied' ? 'a reply' : 'a tap';
    return [`Wait for ${event}, up to`, durationLabel(wait.timeoutMinutes)];
  }
  return ['Wait until', `${durationLabel(wait.minutesBefore)} before the chat window closes`];
}

export function actionLabel(action: ActionStep) {
  const labels = {
    add_tag: 'Add tag',
    remove_tag: 'Remove tag',
    create_task: 'Create task',
    notify_team: 'Notify team',
    hand_to_person: 'Hand to a person',
    give_coupon: 'Give a coupon',
  };
  return labels[action.action];
}

export function actionDetail(action: ActionStep) {
  if (action.action === 'add_tag' || action.action === 'remove_tag') return action.tag;
  if (action.action === 'create_task') return action.title;
  if (action.action === 'notify_team') return action.text;
  if (action.action !== 'give_coupon') return undefined;
  return `${discountLabel(action.discount)}, valid ${pluralize(action.validDays, 'day')}`;
}

function discountLabel(discount: Extract<ActionStep, { action: 'give_coupon' }>['discount']) {
  if (discount.kind === 'percent') return `${discount.percent}% off`;
  if (discount.kind === 'amount') return `${formatMoney(discount.amountPoisha)} off`;
  return 'Free delivery';
}

export function conditionLabel(condition: Condition, stepNumber: (key: string) => number) {
  switch (condition.kind) {
    case 'tapped':
      return `Tapped the link in step ${stepNumber(condition.stepKey)}`;
    case 'replied':
      return condition.buttonKeys.length
        ? `Chose a button in step ${stepNumber(condition.stepKey)}`
        : `Replied to step ${stepNumber(condition.stepKey)}`;
    case 'has_tag':
      return `Has tag ${condition.tag}`;
    case 'in_segment':
      return 'Is in a segment';
    case 'reachable':
      return `Can get ${channelLabels[condition.channel]}`;
    case 'placed_order':
      return 'Has placed an order';
  }
}

function exitLabel(exit: ExitCondition) {
  const labels = {
    placed_order: 'Places an order',
    order_confirmed: 'Order is confirmed',
    order_paid: 'Order is paid',
    order_cancelled: 'Order is cancelled',
    tapped_link: 'Taps a link',
    replied: 'Replies',
  };
  return exit.kind === 'got_tag' ? `Gets tag ${exit.tag}` : labels[exit.kind];
}

function amountFilter(name: string, filter: { operator: string; amountPoisha: number }) {
  const operator = filter.operator === 'at_least' ? 'at least' : 'at most';
  return `${name} ${operator} ${formatMoney(filter.amountPoisha)}`;
}

type FilterLabels = {
  [Field in TriggerFilter['field']]: (filter: Extract<TriggerFilter, { field: Field }>) => string;
};

const filterLabels: FilterLabels = {
  channel: (filter) => `Channel: ${filter.channels.map(words).join(', ')}`,
  consent_source: (filter) => `Source: ${filter.sources.map(words).join(', ')}`,
  tag: (filter) => `Tag: ${filter.tag}`,
  segment: () => 'In a segment',
  lifecycle_stage: (filter) => `Stage: ${words(filter.stage)}`,
  order_total: (filter) => amountFilter('Order total', filter),
  cart_total: (filter) => amountFilter('Cart total', filter),
  product: (filter) => pluralize(filter.productIds.length, 'product'),
  payment_status: (filter) => `Payment: ${filter.statuses.map(words).join(', ')}`,
  delivery_district: (filter) => pluralize(filter.bdAreaIds.length, 'delivery area'),
  first_order: () => 'First order only',
  days: (filter) => pluralize(filter.days, 'day'),
};

function triggerFilterLabel(filter: TriggerFilter) {
  return (filterLabels[filter.field] as (filter: TriggerFilter) => string)(filter);
}

function frequencyLabel(reEntry: AutomationGraph['reEntry']) {
  if (reEntry.rule === 'once') return 'Once ever';
  if (reEntry.rule === 'every_time') return 'Every time';
  return `Once every ${pluralize(reEntry.days, 'day')}`;
}

// Marketing sends need consent; order updates go out without it (CAMP-R2).
function channelConsentLabels(steps: AutomationGraph['steps']) {
  const subscribed = new Set<CampaignChannel>();
  const orderUpdates = new Set<CampaignChannel>();
  for (const step of Object.values(steps)) {
    if (step.kind !== 'send') continue;
    for (const channel of step.channels)
      (step.category === 'marketing' ? subscribed : orderUpdates).add(channel);
  }
  for (const channel of subscribed) orderUpdates.delete(channel);
  const groups: [string, Set<CampaignChannel>][] = [
    ['subscribed', subscribed],
    ['order updates', orderUpdates],
  ];
  return groups
    .filter(([, channels]) => channels.size > 0)
    .map(
      ([need, channels]) => `${[...channels].map((key) => channelLabels[key]).join(', ')}: ${need}`,
    );
}

export function triggerRows(graph: AutomationGraph, stepNumber: (key: string) => number) {
  const { trigger, workflowFilters, goal, exitConditions, reEntry, steps } = graph;
  const exits = [goal, ...exitConditions].filter((exit) => exit !== null).map(exitLabel);
  return [
    ['Trigger filters', trigger.filters.map(triggerFilterLabel).join(' · ') || 'None'],
    [
      'Audience',
      workflowFilters.map((filter) => conditionLabel(filter, stepNumber)).join(' · ') || 'Everyone',
    ],
    ['Frequency', frequencyLabel(reEntry)],
    ['Exit when', exits.join(' · ') || 'None'],
    ['Channels', channelConsentLabels(steps).join(' · ') || 'None'],
  ] as const;
}
