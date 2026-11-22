import { z } from 'zod';

import type { AiToolDefinition } from './ai-agent-tools';
import { MAX_STOCK_QUANTITY } from './products';
import type { AccessLevel, PermissionArea } from './team';

export const reportWindows = ['last_7_days', 'last_30_days', 'last_90_days'] as const;
export type ReportWindow = (typeof reportWindows)[number];

const windowInput = z.strictObject({ window: z.enum(reportWindows) });
const windowWords =
  'window is one of last_7_days, last_30_days, last_90_days; every number also comes for the window right before it, so you can say how it changed.';

// Each tool names the area a member must be able to view, so the model never sees a report the member cannot open.
// A tool that opens a draft or a review needs edit access; a report tool needs view.
export type AssistantToolDefinition = AiToolDefinition & {
  area: PermissionArea;
  level?: Extract<AccessLevel, 'edit'>;
};

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

export const getOrderCountsTool = {
  name: 'get_order_counts',
  area: 'orders',
  description:
    'How many orders are in each stage right now, all time, not a window. Use it for questions about pending orders, orders waiting to be confirmed, orders to pack, orders with the courier. Pending means to_confirm plus on_hold. It takes no arguments.',
  aliases: [
    'পেন্ডিং অর্ডার',
    'কয়টা অর্ডার বাকি',
    'কনফার্ম হয়নি',
    'pending orders',
    'koyta order pending',
    'order confirm baki',
    'orders to pack',
  ],
  input: calendarInput,
  units: {
    pending: 'count of orders waiting for the shop: to_confirm plus on_hold',
    to_confirm: 'count of orders not yet confirmed',
    on_hold: 'count of orders on hold',
    to_pack: 'count of confirmed orders waiting to be packed',
    with_courier: 'count of orders handed to a courier',
    'delivered, partially_delivered, returned, cancelled': 'count of orders in that stage',
  },
} satisfies AssistantToolDefinition;

const MAX_AMOUNT = 10_000_000;
const productOption = z.strictObject({
  name: z.string().trim().min(1).max(100),
  values: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
});

export const draftProductTool = {
  name: 'draft_product',
  area: 'products',
  level: 'edit',
  description:
    'Open the Add product page with the details the owner gave filled in, for the owner to check and save. Nothing is saved. Use it when the owner asks to add or create a new product. Pass only what the owner said; use null for anything they did not say, and an empty list for options they did not give.',
  aliases: [
    'প্রোডাক্ট যোগ করো',
    'নতুন পণ্য',
    'add product',
    'new product',
    'product add koro',
    'tshirt add kore dao',
  ],
  input: z.strictObject({
    name: z.string().trim().min(1).max(200),
    priceTaka: z.number().positive().max(MAX_AMOUNT).nullable(),
    category: z.string().trim().min(1).max(200).nullable(),
    description: z.string().trim().min(1).max(2000).nullable(),
    options: z.array(productOption).max(3),
    stockEach: z.number().int().min(0).max(MAX_STOCK_QUANTITY).nullable(),
  }),
  units: {
    priceTaka:
      'taka as a plain number: 1200 for "1,200 taka", "১২০০" or "twelve hundred"; the price of the product',
    options: 'such as Size with S, M, L, XL, or Colour with Black',
    stockEach: 'pieces in stock of every size or colour combination',
  },
} satisfies AssistantToolDefinition;

export const priceChangeHows = [
  'set',
  'raise_by',
  'lower_by',
  'raise_percent',
  'lower_percent',
] as const;

export const changeProductsTool = {
  name: 'change_products',
  area: 'products',
  level: 'edit',
  description:
    'Open the bulk edit review for products whose name contains the given words, with the old and new price or stock. Use null for a price change or a stock count the owner did not ask for. Nothing is applied until the owner presses Apply. Use it when the owner asks to raise, lower or set prices, give a discount, or set stock for products. The shop works out each new price; never work it out yourself.',
  aliases: [
    'দাম বাড়াও',
    'দাম কমাও',
    'ডিসকাউন্ট দাও',
    'স্টক ঠিক করো',
    'price barao',
    'dam komao',
    'discount dao',
    'stock set koro',
    'raise prices',
  ],
  input: z
    .strictObject({
      productName: z.string().trim().min(3).max(200),
      priceChange: z
        .strictObject({
          how: z.enum(priceChangeHows),
          amount: z.number().positive().max(MAX_AMOUNT),
        })
        .nullable(),
      stock: z.number().int().min(0).max(MAX_STOCK_QUANTITY).nullable(),
    })
    .refine(({ priceChange, stock }) => priceChange !== null || stock !== null, {
      message: 'Give a price change or a stock count',
    }),
  units: {
    productName: 'words in the product name, such as "T-shirt"; the shop finds the products',
    'priceChange.amount':
      'taka for set, raise_by and lower_by (500 for "five hundred taka" or "৫০০ টাকা"); percent for raise_percent and lower_percent (10 for "10%" or "দশ শতাংশ")',
    stock: 'pieces on hand for every matched product with one size that counts stock',
  },
} satisfies AssistantToolDefinition;

export const assistantTools = [
  getOrderCountsTool,
  getSalesTool,
  getSalesTodayTool,
  getSalesYesterdayTool,
  getSalesThisMonthTool,
  getTopProductsTool,
  getMarketingResultsTool,
  getCustomersTool,
  draftProductTool,
  changeProductsTool,
] as const;
