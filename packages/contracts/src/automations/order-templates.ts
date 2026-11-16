import {
  type AutomationTemplate,
  createTask,
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

const EVERY_ORDER = { rule: 'every_time' } as const;
const ORDER_UPDATE_CHANNELS = ['whatsapp', 'sms'] as const;

// Templates that need Orders. Feature 09 lists the four transactional ones in Orders settings too.
export const orderTemplates = {
  cod_confirmation: {
    name: 'COD order confirmation',
    category: 'transactional',
    needs: ['orders'],
    graph: {
      trigger: {
        key: 'order_placed',
        filters: [{ field: 'payment_status', statuses: ['cod_pending'] }],
      },
      reEntry: EVERY_ORDER,
      workflowFilters: [],
      goal: { kind: 'order_confirmed' },
      exitConditions: [{ kind: 'order_cancelled' }],
      firstStepKey: 'ask',
      steps: {
        ask: send(
          'transactional',
          ['whatsapp'],
          '{first_name}, আপনার অর্ডার {order_number} পেয়েছি। মোট {order_total}, ক্যাশ অন ডেলিভারি। অর্ডারটি কনফার্ম করবেন?',
          'wait_reply',
          [
            { key: 'confirm', label: 'কনফার্ম' },
            { key: 'cancel', label: 'বাতিল' },
          ],
        ),
        wait_reply: wait(2 * HOUR, 'sms'),
        sms: send(
          'transactional',
          ['sms'],
          '{first_name}, অর্ডার {order_number} কনফার্ম করতে এই লিংকে যান: {confirm_link}',
          'wait_sms',
        ),
        wait_sms: wait(12 * HOUR, 'call'),
        call: createTask('অর্ডার কনফার্ম করতে কাস্টমারকে ফোন করুন', 'end'),
        end,
      },
    },
  },
  // Feature 07: "Advance not paid in 6 hours, send reminder".
  advance_not_paid: {
    name: 'Advance not paid',
    category: 'transactional',
    needs: ['orders'],
    graph: {
      trigger: {
        key: 'order_placed',
        filters: [{ field: 'payment_status', statuses: ['advance_requested'] }],
      },
      reEntry: EVERY_ORDER,
      workflowFilters: [],
      goal: { kind: 'order_paid' },
      exitConditions: [{ kind: 'order_cancelled' }],
      firstStepKey: 'wait',
      steps: {
        wait: wait(6 * HOUR, 'reminder'),
        reminder: send(
          'transactional',
          ORDER_UPDATE_CHANNELS,
          '{first_name}, অর্ডার {order_number} পাঠাতে অগ্রিম {advance_amount} দরকার। এখানে পেমেন্ট করুন: {payment_link}',
          'end',
        ),
        end,
      },
    },
  },
  shipped: {
    name: 'Shipped and tracking',
    category: 'transactional',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_shipped', filters: [] },
      reEntry: EVERY_ORDER,
      workflowFilters: [],
      goal: null,
      exitConditions: [],
      firstStepKey: 'update',
      steps: {
        update: send(
          'transactional',
          ORDER_UPDATE_CHANNELS,
          '{first_name}, আপনার অর্ডার {order_number} {courier}-এ দেওয়া হয়েছে। ট্র্যাক করুন: {tracking_link}',
          'end',
        ),
        end,
      },
    },
  },
  // WhatsApp allows 3 reply buttons, so the 1 to 5 star rating becomes three answers. No goal:
  // a reply goal would exit before the answer is read.
  delivery_feedback: {
    name: 'Delivery feedback and review',
    category: 'transactional',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_delivered', filters: [] },
      reEntry: EVERY_ORDER,
      workflowFilters: [],
      goal: null,
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(2 * DAY, 'ask'),
        ask: send(
          'transactional',
          ['whatsapp', 'messenger'],
          '{first_name}, অর্ডারটি কেমন লাগল?',
          'wait_reply',
          [
            { key: 'great', label: 'খুব ভালো' },
            { key: 'okay', label: 'মোটামুটি' },
            { key: 'bad', label: 'ভালো না' },
          ],
        ),
        wait_reply: {
          kind: 'wait',
          wait: { until: 'event', event: 'replied', stepKey: 'ask', timeoutMinutes: 2 * DAY },
          next: 'answer',
        },
        answer: {
          kind: 'condition',
          paths: [
            {
              condition: { kind: 'replied', stepKey: 'ask', buttonKeys: ['great'] },
              next: 'review',
            },
            {
              condition: { kind: 'replied', stepKey: 'ask', buttonKeys: ['okay', 'bad'] },
              next: 'call',
            },
          ],
          elseNext: 'end',
        },
        review: send(
          'transactional',
          ['whatsapp', 'messenger'],
          'ধন্যবাদ! আমাদের ফেসবুক পেজে একটা রিভিউ দিলে খুব খুশি হব: {review_link}',
          'end',
        ),
        call: createTask('কাস্টমার অর্ডার নিয়ে খুশি নন, ফোন করে জেনে নিন', 'end'),
        end,
      },
    },
  },
  order_link_abandoned: {
    name: 'Order link not finished',
    category: 'abandoned',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_link_abandoned', filters: [] },
      reEntry: ONCE_A_DAY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(30, 'first'),
        first: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আপনার অর্ডারটি শেষ হয়নি। এখানে শেষ করুন: {link}',
          'wait_again',
        ),
        wait_again: wait(DAY, 'second'),
        second: send(
          'marketing',
          MARKETING_CHANNELS,
          '{product} এখনও আপনার জন্য রাখা আছে: {link}',
          'end',
        ),
        end,
      },
    },
  },
  first_order_thank_you: {
    name: 'Thank you after the first order',
    category: 'post_purchase',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_placed', filters: [{ field: 'first_order' }] },
      reEntry: { rule: 'once' },
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'thanks',
      steps: {
        thanks: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আমাদের থেকে প্রথম অর্ডারের জন্য ধন্যবাদ!',
          'wait_week',
        ),
        wait_week: wait(7 * DAY, 'how_was_it'),
        how_was_it: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, অর্ডারটি কেমন লাগল? জানালে খুশি হব।',
          'wait_two_weeks',
        ),
        wait_two_weeks: wait(14 * DAY, 'coupon'),
        coupon: givePercentCoupon(10, 'come_back'),
        come_back: send(
          'marketing',
          MARKETING_CHANNELS,
          'আবার কেনাকাটায় {offer} ছাড়, কোড {code}, {validity} পর্যন্ত: {link}',
          'end',
        ),
        end,
      },
    },
  },
  cross_sell: {
    name: 'Cross-sell',
    category: 'post_purchase',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_delivered', filters: [] },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'wait',
      steps: {
        wait: wait(7 * DAY, 'suggest'),
        suggest: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আপনার কেনা পণ্যের সাথে মিলিয়ে দেখুন: {recommended_product} {link}',
          'end',
        ),
        end,
      },
    },
  },
  reorder_reminder: {
    name: 'Reorder reminder',
    category: 'post_purchase',
    needs: ['orders'],
    graph: {
      trigger: { key: 'reorder_due', filters: [{ field: 'days', days: 3 }] },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'remind',
      steps: {
        remind: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, {last_product} কি শেষ হয়ে আসছে? আবার অর্ডার করুন: {link}',
          'end',
        ),
        end,
      },
    },
  },
  win_back: {
    name: 'Win back',
    category: 'win_back',
    needs: ['orders'],
    graph: {
      trigger: {
        key: 'lifecycle_stage_entered',
        filters: [{ field: 'lifecycle_stage', stage: 'slipping_away' }],
      },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: { kind: 'placed_order' },
      exitConditions: [],
      firstStepKey: 'hello',
      steps: {
        hello: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, অনেক দিন দেখা নেই! আমাদের নতুন পণ্য দেখুন: {link}',
          'wait_offer',
        ),
        wait_offer: wait(5 * DAY, 'coupon'),
        coupon: givePercentCoupon(10, 'offer'),
        offer: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আপনার জন্য {offer} ছাড়, কোড {code}, {validity} পর্যন্ত: {link}',
          'wait_end',
        ),
        wait_end: wait(10 * DAY, 'end'),
        end,
      },
    },
  },
  cancellation_follow_up: {
    name: 'Cancellation follow-up',
    category: 'post_purchase',
    needs: ['orders'],
    graph: {
      trigger: { key: 'order_cancelled', filters: [] },
      reEntry: DEFAULT_RE_ENTRY,
      workflowFilters: [],
      goal: null,
      exitConditions: [],
      firstStepKey: 'ask',
      steps: {
        ask: send(
          'marketing',
          MARKETING_CHANNELS,
          '{first_name}, আপনার অর্ডারটি বাতিল হয়েছে। কোনো সমস্যা হয়ে থাকলে জানান, আমরা সাহায্য করব।',
          'end',
        ),
        end,
      },
    },
  },
} satisfies Record<string, AutomationTemplate>;
