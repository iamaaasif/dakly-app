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

export const templateGoals = [
  'convert_subscribers',
  'recover_sales',
  'build_trust',
  'repeat_orders',
] as const;

type AutomationTemplate = {
  name: string;
  description: string;
  libraryGoal: (typeof templateGoals)[number];
  category: (typeof templateCategories)[number];
  needs: readonly AutomationPrerequisite[];
  graph: AutomationGraph;
};

const HOUR = 60;
const DAY = 24 * HOUR;
// Once every 30 days is the default re-entry rule (feature 09).
const DEFAULT_RE_ENTRY = { rule: 'every_days', days: 30 } as const;
const MARKETING_CHANNELS = ['whatsapp', 'messenger', 'sms'] as const;
const end: AutomationStep = { kind: 'exit' };

function send(
  category: (typeof sendCategories)[number],
  channels: readonly (typeof campaignChannels)[number][],
  text: string,
  next: string,
): AutomationStep {
  const message = { text, buttons: [] };
  const settings = { ifNotReachable: 'skip', reviewBeforeSending: false } as const;
  return { kind: 'send', category, channels: [...channels], message, next, ...settings };
}

function wait(minutes: number, next: string): AutomationStep {
  return { kind: 'wait', wait: { until: 'duration', minutes }, next };
}

// The release 1 templates that run before Orders. Use template copies a graph into the store as a
// draft. Templates that need Orders, store sync or the tracking script come with their source.
export const automationTemplates = {
  welcome_new_subscriber: {
    name: 'Welcome new subscribers',
    description: 'Thank new subscribers and follow up with your best sellers.',
    libraryGoal: 'convert_subscribers',
    category: 'welcome',
    needs: [],
    graph: {
      trigger: { key: 'consent_given', filters: [] },
      reEntry: { rule: 'once' },
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'welcome',
      steps: {
        welcome: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আমাদের সাথে থাকার জন্য ধন্যবাদ! নতুন পণ্য আর অফার সবার আগে জানাবো।',
          'wait',
        ),
        wait: wait(2 * DAY, 'best_sellers'),
        best_sellers: send(
          'marketing',
          ['sms'],
          'আমাদের সবচেয়ে বেশি বিক্রি হওয়া পণ্যগুলো দেখুন: {link}',
          'end',
        ),
        end,
      },
    },
  },
  // Inside the Messenger window only, so it sends on Messenger and nothing else.
  chat_follow_up: {
    name: 'Chat follow-up',
    description: 'Check whether a shopper needs more help after a chat.',
    libraryGoal: 'recover_sales',
    category: 'abandoned',
    needs: ['channels'],
    graph: {
      trigger: { key: 'chat_started', filters: [{ field: 'channel', channels: ['messenger'] }] },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [{ kind: 'replied' }],
      firstStepKey: 'wait',
      steps: {
        wait: wait(2 * HOUR, 'follow_up'),
        follow_up: send(
          'marketing',
          ['messenger'],
          '{first_name}, আপনার প্রশ্নের উত্তর পেয়েছেন? অর্ডার করতে চাইলে এখানেই জানান।',
          'end',
        ),
        end,
      },
    },
  },
  back_in_stock: {
    name: 'Back in stock',
    description: 'Let shoppers know when a product is available again.',
    libraryGoal: 'recover_sales',
    category: 'abandoned',
    needs: ['products'],
    graph: {
      trigger: { key: 'back_in_stock', filters: [] },
      reEntry: { rule: 'every_time' },
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'notify',
      steps: {
        notify: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, {product} আবার স্টকে এসেছে। অর্ডার করুন: {link}',
          'end',
        ),
        end,
      },
    },
  },
  // The goal is an order within the 7 days the run waits after the greeting.
  birthday: {
    name: 'Birthday',
    description: 'Send a birthday greeting using the date saved on the customer.',
    libraryGoal: 'build_trust',
    category: 'special_occasion',
    needs: ['birthdays'],
    graph: {
      trigger: { key: 'birthday', filters: [] },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'morning',
      steps: {
        morning: { kind: 'wait', wait: { until: 'time_of_day', time: '10:00' }, next: 'greeting' },
        greeting: send(
          'marketing',
          MARKETING_CHANNELS,
          'শুভ জন্মদিন, {first_name}! আপনার দিনটি সুন্দর কাটুক।',
          'wait_week',
        ),
        wait_week: wait(7 * DAY, 'end'),
        end,
      },
    },
  },
  // Runs on every new COD order, and leaves as soon as the order is confirmed or cancelled, so an
  // order saved as confirmed gets no message. Messenger buttons come with their own task.
  cod_order_confirmation: {
    name: 'COD order confirmation',
    description: 'Ask the customer to confirm or cancel a cash on delivery order with a link.',
    libraryGoal: 'build_trust',
    category: 'transactional',
    needs: ['orders'],
    graph: {
      trigger: {
        key: 'order_placed',
        filters: [{ field: 'payment_status', statuses: ['cod_pending'] }],
      },
      reEntry: { rule: 'every_time' },
      workflowFilters: [],
      goal: null,
      exitConditions: [{ kind: 'order_confirmed' }, { kind: 'order_cancelled' }],
      firstStepKey: 'ask',
      steps: {
        ask: send(
          'transactional',
          ['sms'],
          '{first_name}, আপনার অর্ডার #{order_number} ({order_total}) পেয়েছি। নিশ্চিত বা বাতিল করুন: {confirm_link}',
          'wait',
        ),
        wait: wait(6 * HOUR, 'remind'),
        remind: send(
          'transactional',
          ['sms'],
          '{first_name}, অর্ডার #{order_number} এখনো নিশ্চিত হয়নি। নিশ্চিত বা বাতিল করুন: {confirm_link}',
          'end',
        ),
        end,
      },
    },
  },
  // Staff move the order to With courier (D21), so this is the shipped message without a courier
  // tracking link; the link comes with the courier connection.
  shipped_order: {
    name: 'Order shipped',
    description: 'Tell the customer their order is on its way.',
    libraryGoal: 'build_trust',
    category: 'transactional',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_shipped', filters: [] },
      reEntry: { rule: 'every_time' },
      workflowFilters: [],
      goal: null,
      exitConditions: [{ kind: 'order_cancelled' }],
      firstStepKey: 'shipped',
      steps: {
        shipped: send(
          'transactional',
          ['sms'],
          '{first_name}, আপনার অর্ডার #{order_number} কুরিয়ারে পাঠানো হয়েছে।',
          'end',
        ),
        end,
      },
    },
  },
  thank_you_first_order: {
    name: 'Thank you after the first order',
    description: 'Thank a new customer the day after their first order.',
    libraryGoal: 'repeat_orders',
    category: 'post_purchase',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_placed', filters: [{ field: 'first_order' }] },
      reEntry: { rule: 'once' },
      workflowFilters: [],
      goal: null,
      exitConditions: [{ kind: 'order_cancelled' }],
      firstStepKey: 'wait',
      steps: {
        wait: wait(DAY, 'thanks'),
        thanks: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, প্রথম অর্ডারের জন্য ধন্যবাদ! আপনার অর্ডার #{order_number} নিয়ে কিছু জানার থাকলে আমাদের জানান।',
          'end',
        ),
        end,
      },
    },
  },
  cancellation_follow_up: {
    name: 'Cancellation follow-up',
    description: 'Ask a customer whose order was cancelled whether you can help.',
    libraryGoal: 'recover_sales',
    category: 'post_purchase',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_cancelled', filters: [] },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(DAY, 'ask'),
        ask: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আপনার অর্ডার #{order_number} বাতিল হয়েছে। কোনো সমস্যা হয়ে থাকলে আমাদের জানান, আমরা সাহায্য করব।',
          'end',
        ),
        end,
      },
    },
  },
} satisfies Record<string, AutomationTemplate>;
export type TemplateKey = keyof typeof automationTemplates;
