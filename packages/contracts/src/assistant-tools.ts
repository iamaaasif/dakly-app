import { z } from 'zod';

import type { AiToolDefinition } from './ai-agent-tools';
import type { PermissionArea } from './team';

export const reportWindows = ['last_7_days', 'last_30_days', 'last_90_days'] as const;
export type ReportWindow = (typeof reportWindows)[number];

const windowInput = z.strictObject({ window: z.enum(reportWindows) });
const windowWords =
  'window is one of last_7_days, last_30_days, last_90_days; every number also comes for the window right before it, so you can say how it changed.';

// Each tool names the area a member must be able to view, so the model never sees a report the member cannot open.
export type AssistantToolDefinition = AiToolDefinition & { area: PermissionArea };

export const getSalesTool = {
  name: 'get_sales',
  area: 'orders',
  description: `Orders and sales of the shop for a window, with the average order value. Use it for questions about how many orders, how much sold, or how big an order is. For money that came from Dakly messages use get_marketing_results. ${windowWords}`,
  aliases: [
    'বিক্রি',
    'অর্ডার কত',
    'বিক্রয়',
    'sales koto',
    'koto bikri',
    'orders',
    'revenue',
    'income',
    'average order',
  ],
  input: windowInput,
  units: {
    orders: 'count of orders created in the window, cancelled ones left out',
    salesTaka: 'taka, converted from poisha; items after discount, delivery left out',
    averageOrderValueTaka: 'taka, delivered orders only; 0 when nothing was delivered',
    'previous… and …ChangePercent':
      'the window before, and percent change against it; null when the earlier window had 0',
    days: 'length of the window in days, in Asia/Dhaka days',
  },
} satisfies AssistantToolDefinition;

export const getMarketingResultsTool = {
  name: 'get_marketing_results',
  area: 'analytics',
  description: `Money and orders that came from Dakly messages and posts (campaigns, automations, links). Use it for questions about what marketing earned. For all sales use get_sales. ${windowWords}`,
  aliases: [
    'ক্যাম্পেইন থেকে কত',
    'মেসেজ থেকে বিক্রি',
    'campaign result',
    'campaign performance',
    'marketing theke koto',
    'message theke order',
  ],
  input: windowInput,
  units: {
    revenueTaka: 'taka, converted from poisha; attributed orders after discount, delivery left out',
    orders: 'count of attributed orders',
    'previous… and …ChangePercent':
      'the window before, and percent change against it; null when the earlier window had 0',
    days: 'length of the window in days, in Asia/Dhaka days',
  },
} satisfies AssistantToolDefinition;

export const getCustomersTool = {
  name: 'get_customers',
  area: 'customers',
  description: `New customers, customers who came back, and how many customers are in each lifecycle stage today. Use it for questions about who is buying, repeat buyers, or customers slipping away. ${windowWords} Stages are best, new, regulars, bought_once, slipping_away and stopped_buying; every customer is in exactly one.`,
  aliases: [
    'নতুন কাস্টমার',
    'পুরনো কাস্টমার',
    'ফিরে এসেছে',
    'new customers',
    'repeat customer',
    'customer koto',
    'kara kinche na',
  ],
  input: windowInput,
  units: {
    newCustomers: 'count of customers whose first order is in the window',
    cameBack: 'count of customers who ordered in the window and had ordered before it',
    stages: 'count of customers in each lifecycle stage, as of the latest snapshot in the window',
    'previous… and …ChangePercent':
      'the window before, and percent change against it; null when the earlier window had 0',
    days: 'length of the window in days, in Asia/Dhaka days',
  },
} satisfies AssistantToolDefinition;

const calendarInput = z.strictObject({});

const calendarSalesUnits = {
  orders: 'count of orders created in the period, cancelled ones left out',
  salesTaka: 'taka, converted from poisha; items after discount, delivery left out',
  averageOrderValueTaka: 'taka, delivered orders only; 0 when nothing was delivered',
  'previous… and …ChangePercent':
    'the period right before it, and percent change against it; null when the earlier period had 0',
  from: 'first day of the period, in Asia/Dhaka days',
  through: 'last day of the period, in Asia/Dhaka days',
};

export const getSalesTodayTool = {
  name: 'get_sales_today',
  area: 'orders',
  description:
    'Orders and sales of the shop so far today, with the average order value, against all of yesterday. Use it for questions about today. It takes no arguments.',
  aliases: ['আজ কত বিক্রি', 'আজকের অর্ডার', 'sales today', 'ajke koto bikri', 'today orders'],
  input: calendarInput,
  units: calendarSalesUnits,
} satisfies AssistantToolDefinition;

export const getSalesYesterdayTool = {
  name: 'get_sales_yesterday',
  area: 'orders',
  description:
    'Orders and sales of the shop for all of yesterday, with the average order value, against the day before. Use it for questions about yesterday. It takes no arguments.',
  aliases: ['গতকাল কত বিক্রি', 'গতকালের অর্ডার', 'sales yesterday', 'gotokal koto bikri'],
  input: calendarInput,
  units: calendarSalesUnits,
} satisfies AssistantToolDefinition;

export const getSalesThisMonthTool = {
  name: 'get_sales_this_month',
  area: 'orders',
  description:
    'Orders and sales of the shop from the first of this month until today, with the average order value, against the same days of last month. Use it for questions about this month. It takes no arguments.',
  aliases: [
    'এই মাসে কত বিক্রি',
    'এই মাসের অর্ডার',
    'sales this month',
    'ei mashe koto bikri',
    'monthly sales',
  ],
  input: calendarInput,
  units: calendarSalesUnits,
} satisfies AssistantToolDefinition;

export const getTopProductsTool = {
  name: 'get_top_products',
  area: 'orders',
  description: `The products that sold most in a window, best first, up to 5. Use it for questions about the best selling or most popular product. ${windowWords}`,
  aliases: [
    'কোন পণ্য বেশি বিক্রি হয়',
    'সেরা পণ্য',
    'best selling product',
    'top products',
    'kon product beshi bikri hoy',
    'popular product',
  ],
  input: windowInput,
  units: {
    'products[].name': 'the product name as it was on its latest order in the window',
    'products[].units': 'count of items sold in the window, cancelled orders left out',
    'products[].salesTaka':
      'taka, converted from poisha; those items after discount, delivery left out',
    days: 'length of the window in days, in Asia/Dhaka days',
  },
} satisfies AssistantToolDefinition;

export const assistantTools = [
  getSalesTool,
  getSalesTodayTool,
  getSalesYesterdayTool,
  getSalesThisMonthTool,
  getTopProductsTool,
  getMarketingResultsTool,
  getCustomersTool,
] as const;
