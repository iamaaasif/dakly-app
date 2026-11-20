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

export const assistantTools = [getSalesTool, getMarketingResultsTool, getCustomersTool] as const;
