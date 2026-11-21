import { describe, expect, it, vi } from 'vitest';

import { LlmError } from '@dakly/providers/llm/llm-driver';

import type { AiService } from '../ai/ai.service';
import { AppError } from '../platform/errors/app-error';
import type { ProductSearchSourceService } from '../products/product-search-source.service';
import type { ChatProduct, ProductsService } from '../products/products.service';
import { ProductSearchService } from './product-search.service';

const candidate = (id: string, name: string, aliases: string[] = []) => ({
  id,
  name,
  aliases,
  category: null,
  description: null,
  optionValues: [],
  pricesPoisha: [100_000],
});
const chatProduct = (id: string, available: number): ChatProduct => ({
  id,
  name: id,
  isStockTracked: true,
  description: null,
  category: null,
  variants: [{ id: `${id}-v`, title: 'M', isDefault: true, pricePoisha: 100_000, available }],
});

function build(options: {
  embed?: () => Promise<unknown>;
  nearest?: { id: string; distance: number }[];
}) {
  const source = {
    listSearchCandidates: async () => [
      candidate('kurti-sold-out', 'Cotton Kurti', ['কুর্তি']),
      candidate('kurti-new', 'Printed Kurti'),
      candidate('lehenga', 'Bridal Lehenga'),
    ],
    nearestForChat: async () => options.nearest ?? [],
  } as unknown as ProductSearchSourceService;
  const products = {
    getManyForChat: async (_storeId: string, ids: string[]) =>
      ids.map((id) => chatProduct(id, id === 'kurti-sold-out' ? 0 : 4)),
  } as unknown as ProductsService;
  const ai = {
    embed: vi.fn(options.embed ?? (async () => ({ embeddings: [[0.1]], model: 'm' }))),
  } as unknown as AiService;
  return new ProductSearchService(products, source, ai);
}

describe('ProductSearchService', () => {
  it('puts sold-out products behind ones the shop can sell', async () => {
    const found = await build({}).search('store', 'কুর্তি', 3);
    expect(found.map((product) => product.id)).toEqual(['kurti-new', 'kurti-sold-out']);
  });

  it('adds a product found only by meaning', async () => {
    const found = await build({ nearest: [{ id: 'lehenga', distance: 0.3 }] }).search(
      'store',
      'wedding dress',
      3,
    );
    expect(found.map((product) => product.id)).toEqual(['lehenga']);
  });

  it('ignores a product that is too far in meaning', async () => {
    const found = await build({ nearest: [{ id: 'lehenga', distance: 0.9 }] }).search(
      'store',
      'laptop',
      3,
    );
    expect(found).toEqual([]);
  });

  it('still answers by spelling when the AI call fails', async () => {
    const service = build({
      embed: async () => {
        throw new LlmError('LLM_TIMEOUT');
      },
    });
    expect((await service.search('store', 'kurti', 3)).length).toBe(2);
  });

  it('still answers by spelling when the AI is paused', async () => {
    const service = build({
      embed: async () => {
        throw new AppError('AI_PAUSED', { status: 503, message: 'The AI is paused' });
      },
    });
    expect((await service.search('store', 'kurti', 3)).length).toBe(2);
  });

  it('lets a programming error through', async () => {
    const service = build({
      embed: async () => {
        throw new AppError('AI_INSIDE_TRANSACTION', {
          status: 500,
          message: 'Called inside a transaction',
        });
      },
    });
    await expect(service.search('store', 'kurti', 3)).rejects.toMatchObject({
      code: 'AI_INSIDE_TRANSACTION',
    });
  });

  it('asks, with only products in stock, when a long photo text fits two kurtis', async () => {
    const photo = 'red kurti with white flower print on a hanger, front view, plain background';
    const found = await build({}).matchPhoto('store', photo);
    expect(found).toMatchObject({ kind: 'unsure', products: [{ id: 'kurti-new' }] });
  });

  it('says a photo of a sold-out product is sold out', async () => {
    const found = await build({}).matchPhoto('store', 'a cotton kurti on a hanger');
    expect(found).toMatchObject({ kind: 'sold_out', product: { id: 'kurti-sold-out' } });
  });
});
