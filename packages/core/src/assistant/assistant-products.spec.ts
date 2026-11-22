import { describe, expect, it } from 'vitest';

import type { ProductResponse } from '@dakly/contracts/products';
import type { StoreAccess } from '@dakly/contracts/team';

import type { AiService } from '../ai/ai.service';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { OrderStageCountsService } from '../orders/order-stage-counts.service';
import type { ProductsService } from '../products/products.service';
import { TeamService } from '../team/team.service';
import type { UsageService } from '../usage/usage.service';
import { AssistantProductToolsService } from './assistant-product-tools.service';
import { AssistantToolsService } from './assistant-tools.service';
import { AssistantService } from './assistant.service';

const storeId = '40e63a5e-4024-45c1-aada-dd7566a54876';
const editor: StoreAccess = {
  role: 'custom',
  areas: { products: 'edit' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
};
const viewer: StoreAccess = { ...editor, areas: { products: 'view', orders: 'view' } };

function product(name: string, pricePoisha: number, onHand = 4, override: number | null = null) {
  return {
    id: crypto.randomUUID(),
    name,
    pricePoisha,
    isStockTracked: true,
    variants: [{ id: crypto.randomUUID(), priceOverridePoisha: override, onHand }],
  } as unknown as ProductResponse;
}

// Only reads exist on this stub, so an answer that wrote a product could not have happened.
function assistant(found: ProductResponse[], script: unknown[]) {
  const searches: unknown[] = [];
  const products = {
    list: async (_: string, query: unknown) => {
      searches.push(query);
      return { items: found, nextCursor: null };
    },
  } as unknown as ProductsService;
  const ai = {
    run: async () => script.shift(),
  } as unknown as AiService;
  const usage = {
    hasAllowance: async () => true,
    remaining: async () => 9,
  } as unknown as UsageService;
  const tools = new AssistantToolsService(
    {} as AnalyticsService,
    {} as OrderStageCountsService,
    new TeamService(undefined as never),
    new AssistantProductToolsService(products),
  );
  return { service: new AssistantService(ai, tools, usage), searches };
}

// The model always sends every field; null says the owner did not give it.
const noDraftDetails = {
  priceTaka: null,
  category: null,
  description: null,
  options: [],
  stockEach: null,
};
const call = (name: string, input: object) => ({
  kind: 'tool_calls' as const,
  aiRunId: 'run-1',
  toolCalls: [{ id: 'call-1', name, argumentsJson: JSON.stringify(input) }],
});
const reply = (text: string) => ({
  kind: 'output' as const,
  aiRunId: 'run-2',
  output: { reply: text },
});
const ask = (question: string) => ({ question, history: [] });

describe('Ask Dakly AI product drafts', () => {
  it('opens a draft from what the owner said, with the price in poisha and nothing saved', async () => {
    const { service } = assistant(
      [],
      [
        call('draft_product', {
          ...noDraftDetails,
          name: 'Black cotton T-shirt',
          priceTaka: 1200,
          options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
          stockEach: 10,
        }),
        reply(
          'I filled in the form with a price of ৳1,200 and 10 of each size. Check it, then press Save.',
        ),
      ],
    );
    expect(
      await service.ask(storeId, editor, ask('add a black cotton T-shirt, 1,200 taka')),
    ).toEqual({
      kind: 'product_draft',
      text: expect.any(String),
      creditsLeft: 9,
      draft: {
        name: 'Black cotton T-shirt',
        pricePoisha: 120_000,
        options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
        stockEach: 10,
      },
    });
  });

  it('does not offer product tools to a member who can only view products', async () => {
    const { service } = assistant(
      [],
      [
        call('draft_product', { ...noDraftDetails, name: 'Shirt', priceTaka: 500 }),
        reply('I can’t answer that yet.'),
      ],
    );
    expect(await service.ask(storeId, viewer, ask('add a shirt'))).toMatchObject({
      kind: 'cannot_answer',
    });
  });
});

describe('Ask Dakly AI product changes', () => {
  it('works out each new price in the shop and returns old and new for review', async () => {
    const shirts = [product('Polo T-shirt', 80_000), product('Basic T-shirt', 65_050)];
    const { service, searches } = assistant(shirts, [
      call('change_products', {
        productName: 'T-shirt',
        priceChange: { how: 'raise_by', amount: 50 },
        stock: null,
      }),
      reply('I opened the review for 2 T-shirts. Check it, then press Apply.'),
    ]);
    const answer = await service.ask(storeId, editor, ask('raise all T-shirt prices by 50 taka'));
    expect(searches).toEqual([{ search: 'T-shirt', limit: 51 }]);
    expect(answer).toMatchObject({
      kind: 'product_change',
      change: {
        products: shirts,
        rows: [
          { productId: shirts[0]!.id, pricePoisha: 85_000 },
          { productId: shirts[1]!.id, pricePoisha: 70_050 },
        ],
      },
    });
  });

  it('lowers by a percent and sets stock only where stock is counted on one size', async () => {
    const tracked = product('Panjabi', 100_000, 4);
    const untracked = { ...product('Panjabi sale', 100_000), isStockTracked: false };
    const { service } = assistant(
      [tracked, untracked],
      [
        call('change_products', {
          productName: 'Panjabi',
          priceChange: { how: 'lower_percent', amount: 10 },
          stock: 12,
        }),
        reply('Opened the review. Press Apply to save it.'),
      ],
    );
    const answer = await service.ask(storeId, editor, ask('panjabi 10% kome 12 piece koro'));
    expect(answer).toMatchObject({
      kind: 'product_change',
      change: {
        rows: [
          { productId: tracked.id, pricePoisha: 90_000, stock: 12 },
          { productId: untracked.id, pricePoisha: 90_000 },
        ],
      },
    });
  });

  it('leaves a product with its own size prices out of a price change', async () => {
    const sized = product('Kurti', 100_000, 4, 120_000);
    const { service } = assistant(
      [sized],
      [
        call('change_products', {
          productName: 'Kurti',
          priceChange: { how: 'set', amount: 900 },
          stock: null,
        }),
        reply('Those products have prices per size, so nothing was changed.'),
      ],
    );
    expect(await service.ask(storeId, editor, ask('kurti dam 900 koro'))).toMatchObject({
      kind: 'cannot_answer',
    });
  });

  it('asks to narrow down when nothing matches or more than 50 match', async () => {
    const many = Array.from({ length: 51 }, (_, index) => product(`Shirt ${index}`, 50_000));
    for (const found of [[], many]) {
      const { service } = assistant(found, [
        call('change_products', { productName: 'shirt', priceChange: null, stock: 5 }),
        reply('Please tell me the product name more exactly.'),
      ]);
      expect(await service.ask(storeId, editor, ask('set shirt stock to 5'))).toEqual({
        kind: 'cannot_answer',
        text: 'Please tell me the product name more exactly.',
      });
    }
  });

  it('never lowers a price to zero or below', async () => {
    const cheap = product('Sticker', 4_000);
    const { service } = assistant(
      [cheap],
      [
        call('change_products', {
          productName: 'Sticker',
          priceChange: { how: 'lower_by', amount: 50 },
          stock: null,
        }),
        reply('Nothing could be lowered.'),
      ],
    );
    expect(await service.ask(storeId, editor, ask('sticker 50 taka komao'))).toMatchObject({
      kind: 'cannot_answer',
    });
  });
});
