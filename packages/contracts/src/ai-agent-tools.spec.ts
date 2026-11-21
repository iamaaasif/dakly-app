import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { salesAgentTools } from './ai-agent-tools';

const banglaLetters = /[ঀ-৿]/u;
const forbiddenArguments = ['storeId', 'contactId', 'conversationId', 'price', 'amount'];

describe('sales agent tools', () => {
  it('describe themselves with Bangla, Banglish and English words customers use', () => {
    for (const tool of salesAgentTools) {
      expect(
        tool.aliases.some((alias) => banglaLetters.test(alias)),
        tool.name,
      ).toBe(true);
      expect(
        tool.aliases.some((alias) => /^[\x20-\x7e]+$/.test(alias)),
        tool.name,
      ).toBe(true);
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
    }
  });

  it('name the unit of every money or count field', () => {
    const withMoney = salesAgentTools.filter((tool) => /taka/i.test(JSON.stringify(tool.units)));
    expect(withMoney.map((tool) => tool.name)).toEqual([
      'search_products',
      'get_product',
      'get_delivery_charge',
      'get_my_orders',
      'get_order_status',
      'draft_order',
    ]);
  });

  // OpenAI strict tools need every property listed as required; an optional one fails every call.
  it('mark every argument required, with null for an empty choice', () => {
    for (const tool of salesAgentTools) {
      const { properties = {}, required = [] } = z.toJSONSchema(tool.input, { io: 'input' }) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(required.toSorted(), tool.name).toEqual(Object.keys(properties).toSorted());
    }
  });

  it('never take a store, customer, conversation, price or amount argument', () => {
    for (const tool of salesAgentTools) {
      const { properties = {} } = z.toJSONSchema(tool.input, { io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      expect(Object.keys(properties).filter((name) => forbiddenArguments.includes(name))).toEqual(
        [],
      );
    }
  });

  it('reject arguments the model was not given', () => {
    for (const tool of salesAgentTools)
      expect(tool.input.safeParse({ storeId: crypto.randomUUID() }).success, tool.name).toBe(false);
  });

  it('take an order only with a valid own mobile number and bounded quantities', () => {
    const draft = salesAgentTools.find((tool) => tool.name === 'draft_order')!;
    const order = {
      items: [{ variantId: crypto.randomUUID(), quantity: 2 }],
      recipientName: 'রিনা',
      phone: '01712345678',
      address: 'মিরপুর ১০',
      area: 'Dhaka',
    };
    expect(draft.input.safeParse(order).success).toBe(true);
    expect(draft.input.safeParse({ ...order, phone: '12345' }).success).toBe(false);
    expect(draft.input.safeParse({ ...order, items: [] }).success).toBe(false);
    expect(
      draft.input.safeParse({ ...order, items: [{ ...order.items[0], quantity: 21 }] }).success,
    ).toBe(false);
  });

  it('only accept hand-over reasons the model may choose', () => {
    const handOver = salesAgentTools.find((tool) => tool.name === 'hand_over')!;
    expect(handOver.input.safeParse({ reason: 'refund' }).success).toBe(true);
    expect(handOver.input.safeParse({ reason: 'allowance_used' }).success).toBe(false);
  });
});
