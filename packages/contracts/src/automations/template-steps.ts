import { type campaignChannels } from '../campaigns';
import { type AutomationPrerequisite } from './catalogue';
import { type AutomationGraph, type AutomationStep, type sendCategories } from './graph';

// Library types in feature 09. AUTO-R2 ranks transactional, then abandoned, then welcome.
export const templateCategories = [
  'transactional',
  'abandoned',
  'welcome',
  'post_purchase',
  'win_back',
  'special_occasion',
] as const;

export type AutomationTemplate = {
  name: string;
  category: (typeof templateCategories)[number];
  needs: readonly AutomationPrerequisite[];
  graph: AutomationGraph;
};

export const HOUR = 60;
export const DAY = 24 * HOUR;
// Once every 30 days is the default; cart and order-link reminders allow once a day (feature 09).
export const DEFAULT_RE_ENTRY = { rule: 'every_days', days: 30 } as const;
export const ONCE_A_DAY = { rule: 'every_days', days: 1 } as const;
export const MARKETING_CHANNELS = ['whatsapp', 'messenger', 'sms'] as const;
export const end: AutomationStep = { kind: 'exit' };

export function send(
  category: (typeof sendCategories)[number],
  channels: readonly (typeof campaignChannels)[number][],
  text: string,
  next: string,
  buttons: { key: string; label: string }[] = [],
): AutomationStep {
  const message = { text, buttons };
  const settings = { ifNotReachable: 'skip', reviewBeforeSending: false } as const;
  return { kind: 'send', category, channels: [...channels], message, next, ...settings };
}

export function wait(minutes: number, next: string): AutomationStep {
  return { kind: 'wait', wait: { until: 'duration', minutes }, next };
}

export function createTask(title: string, next: string): AutomationStep {
  return { kind: 'action', action: { action: 'create_task', title }, next };
}

export function givePercentCoupon(percent: number, next: string): AutomationStep {
  const discount = { kind: 'percent', percent } as const;
  return { kind: 'action', action: { action: 'give_coupon', discount, validDays: 7 }, next };
}
