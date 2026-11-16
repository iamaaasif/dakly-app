import { type festivals } from './catalogue';
import { orderTemplates } from './order-templates';
import {
  type AutomationTemplate,
  DAY,
  DEFAULT_RE_ENTRY,
  end,
  givePercentCoupon,
  HOUR,
  MARKETING_CHANNELS,
  ONCE_A_DAY,
  send,
  wait,
} from './template-steps';

function festivalGreeting(
  name: string,
  festival: (typeof festivals)[number],
  greeting: string,
): AutomationTemplate {
  return {
    name,
    category: 'special_occasion',
    needs: [],
    graph: {
      trigger: { key: 'festival', filters: [{ field: 'festival', festival }] },
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
          `{first_name}, ${greeting}! {store_name}-এর পক্ষ থেকে শুভেচ্ছা।`,
          'end',
        ),
        end,
      },
    },
  };
}

type ReminderSettings = Pick<AutomationTemplate, 'name' | 'needs'> & {
  trigger: 'checkout_abandoned' | 'product_viewed';
  reEntry: AutomationTemplate['graph']['reEntry'];
  delayMinutes: number;
  text: string;
};

function abandonedReminder(settings: ReminderSettings): AutomationTemplate {
  return {
    name: settings.name,
    category: 'abandoned',
    needs: settings.needs,
    graph: {
      trigger: { key: settings.trigger, filters: [] },
      reEntry: settings.reEntry,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(settings.delayMinutes, 'remind'),
        remind: send('marketing', MARKETING_CHANNELS, settings.text, 'end'),
        end,
      },
    },
  };
}

const contactTemplates = {
  welcome_new_subscriber: {
    name: 'Welcome new subscribers',
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
  welcome_new_lead: {
    name: 'Welcome new lead',
    category: 'welcome',
    needs: ['channels', 'orders'],
    graph: {
      trigger: { key: 'lead_captured', filters: [] },
      reEntry: { rule: 'once' },
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(HOUR, 'best_sellers'),
        best_sellers: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আমাদের বেস্টসেলার পণ্যগুলো দেখুন: {link}',
          'wait_offer',
        ),
        wait_offer: wait(2 * DAY, 'coupon'),
        coupon: givePercentCoupon(10, 'offer'),
        offer: send(
          'marketing',
          MARKETING_CHANNELS,
          'প্রথম অর্ডারে {offer} ছাড়, কোড {code}, {validity} পর্যন্ত: {link}',
          'end',
        ),
        end,
      },
    },
  },
  // Inside the Messenger window only, so it sends on Messenger and nothing else.
  chat_follow_up: {
    name: 'Chat follow-up',
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
  eid_ul_fitr: festivalGreeting('Eid ul-Fitr greeting', 'eid_ul_fitr', 'ঈদ মোবারক'),
  eid_ul_adha: festivalGreeting('Eid ul-Adha greeting', 'eid_ul_adha', 'ঈদ মোবারক'),
  durga_puja: festivalGreeting('Durga Puja greeting', 'durga_puja', 'শারদীয় শুভেচ্ছা'),
  pohela_boishakh: festivalGreeting('Pohela Boishakh greeting', 'pohela_boishakh', 'শুভ নববর্ষ'),
  cart_abandoned: {
    name: 'Abandoned cart',
    category: 'abandoned',
    needs: ['store_sync'],
    graph: {
      trigger: { key: 'cart_abandoned', filters: [] },
      reEntry: ONCE_A_DAY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(HOUR, 'first'),
        first: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আপনার কার্টে পণ্য রয়ে গেছে। অর্ডার শেষ করুন: {link}',
          'wait_again',
        ),
        wait_again: wait(DAY, 'second'),
        second: send('marketing', ['sms'], 'আপনার কার্টের পণ্যগুলো এখনও আছে: {link}', 'end'),
        end,
      },
    },
  },
  checkout_abandoned: abandonedReminder({
    name: 'Abandoned checkout',
    trigger: 'checkout_abandoned',
    needs: ['store_sync'],
    reEntry: ONCE_A_DAY,
    delayMinutes: 30,
    text: '{first_name}, অর্ডার প্রায় শেষ! এখানে শেষ করুন: {link}',
  }),
  browse_abandonment: abandonedReminder({
    name: 'Browse abandonment',
    trigger: 'product_viewed',
    needs: ['tracking_script'],
    reEntry: DEFAULT_RE_ENTRY,
    delayMinutes: 4 * HOUR,
    text: '{first_name}, {product} পছন্দ হয়েছে? অর্ডার করুন: {link}',
  }),
} satisfies Record<string, AutomationTemplate>;

// The release 1 template library. Use template copies a graph into the store as a draft.
export const automationTemplates = { ...contactTemplates, ...orderTemplates };
export type TemplateKey = keyof typeof automationTemplates;
