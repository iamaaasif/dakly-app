import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { assistantTools } from './assistant-tools';

const banglaLetters = /[ঀ-৿]/u;
const forbiddenArguments = ['storeId', 'contactId', 'userId', 'price', 'amount'];

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

  it('never take a store, user, price or amount argument', () => {
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
    for (const tool of assistantTools.filter(({ input }) => !input.safeParse({}).success)) {
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
    const calendarTools = assistantTools.filter(({ input }) => input.safeParse({}).success);
    expect(calendarTools.map(({ name }) => name)).toEqual([
      'get_order_counts',
      'get_sales_today',
      'get_sales_yesterday',
      'get_sales_this_month',
    ]);
    for (const tool of calendarTools)
      expect(tool.input.safeParse({ storeId: crypto.randomUUID() }).success, tool.name).toBe(false);
  });
});
