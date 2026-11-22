import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  assistantTools,
  changeProductsTool,
  draftProductTool,
  priceChangeHows,
} from './assistant-tools';

const banglaLetters = /[ঀ-৿]/u;
const forbiddenArguments = ['storeId', 'contactId', 'userId', 'productId'];
const noDraftDetails = {
  priceTaka: null,
  category: null,
  description: null,
  options: [],
  stockEach: null,
};
const reportTools = assistantTools.filter((tool) => !('level' in tool));

describe('Ask Dakly AI tools', () => {
  it('describe themselves with Bangla, Banglish and English words owners use', () => {
    for (const tool of assistantTools) {
      expect(
        tool.aliases.some((alias) => banglaLetters.test(alias)),
        tool.name,
      ).toBe(true);
      expect(
        tool.aliases.some((alias) => /^[\x20-\x7e]+$/.test(alias)),
        tool.name,
      ).toBe(true);
    }
  });

  it('never take a store, user or product id argument', () => {
    for (const tool of assistantTools) {
      const { properties = {} } = z.toJSONSchema(tool.input, { io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      expect(Object.keys(properties).filter((name) => forbiddenArguments.includes(name))).toEqual(
        [],
      );
    }
  });

  it('accept only the listed windows and no other argument', () => {
    for (const tool of reportTools.filter(({ input }) => !input.safeParse({}).success)) {
      expect(tool.description, tool.name).toContain('last_30_days');
      expect(tool.input.safeParse({ window: 'last_7_days' }).success, tool.name).toBe(true);
      expect(tool.input.safeParse({ window: 'last_year' }).success, tool.name).toBe(false);
      expect(
        tool.input.safeParse({ window: 'last_7_days', storeId: crypto.randomUUID() }).success,
        tool.name,
      ).toBe(false);
    }
  });

  it('ask for today, yesterday and this month with no argument at all', () => {
    const calendarTools = reportTools.filter(({ input }) => input.safeParse({}).success);
    expect(calendarTools.map(({ name }) => name)).toEqual([
      'get_order_counts',
      'get_sales_today',
      'get_sales_yesterday',
      'get_sales_this_month',
    ]);
    for (const tool of calendarTools)
      expect(tool.input.safeParse({ storeId: crypto.randomUUID() }).success, tool.name).toBe(false);
  });

  it('offer the product tools only to members who can edit products, and take values never ids', () => {
    for (const tool of [draftProductTool, changeProductsTool]) {
      expect(tool.area).toBe('products');
      expect(tool.level).toBe('edit');
    }
    expect(
      draftProductTool.input.safeParse({ ...noDraftDetails, name: 'T-shirt', productId: 'x' })
        .success,
    ).toBe(false);
    expect(
      changeProductsTool.input.safeParse({
        productName: 'T-shirt',
        productId: 'x',
        priceChange: null,
        stock: 3,
      }).success,
    ).toBe(false);
  });

  it('refuse a product change that names no price or stock', () => {
    expect(
      changeProductsTool.input.safeParse({ productName: 'T-shirt', priceChange: null, stock: null })
        .success,
    ).toBe(false);
    expect(
      changeProductsTool.input.safeParse({
        productName: 'T-shirt',
        priceChange: { how: priceChangeHows[1], amount: 50 },
        stock: null,
      }).success,
    ).toBe(true);
  });
});
