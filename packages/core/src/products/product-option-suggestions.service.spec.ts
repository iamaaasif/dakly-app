import { describe, expect, it } from 'vitest';

import type { AiService } from '../ai/ai.service';
import { ProductOptionSuggestionsService } from './product-option-suggestions.service';
import type { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import type { ProductsService } from './products.service';

type Reply = { kind: 'output'; output: { options: { name: string; values: string[] }[] } };

function setup(replies: Record<string, Reply | { kind: 'failure'; code: string }>) {
  const tiers: string[] = [];
  const service = new ProductOptionSuggestionsService(
    {
      getById: async () => ({ name: 'Cotton T-shirt', imageFileIds: ['photo'] }),
    } as never as ProductsService,
    {
      find: async () => ({ objectKey: 'key', contentType: 'image/png', isTagged: false }),
    } as never as ProductPhotoTagsRepository,
    {
      run: async (_store: string, request: { tier: string }) => {
        tiers.push(request.tier);
        return replies[request.tier] ?? { kind: 'failure', code: 'AI_PAUSED' };
      },
    } as never as AiService,
    { readBytes: async () => ({ kind: 'found', bytes: new Uint8Array([1]) }) } as never,
  );
  return { service, tiers };
}

const sizes: Reply = {
  kind: 'output',
  output: { options: [{ name: 'Size', values: ['S', 'M'] }] },
};
const colours: Reply = {
  kind: 'output',
  output: { options: [{ name: 'Colour', values: ['Black', 'black', 'White'] }] },
};

describe('product option suggestions', () => {
  it('reads sizes from the title and colours from the photos', async () => {
    const { service, tiers } = setup({ fast: sizes, vision: colours });
    const result = await service.suggest('store', { name: '', productId: 'product' });
    expect(result.options).toEqual([
      { name: 'Size', values: ['S', 'M'] },
      { name: 'Colour', values: ['Black', 'White'] },
    ]);
    expect(tiers.sort()).toEqual(['fast', 'vision']);
  });

  it('uses only the title on a product without photos', async () => {
    const { service, tiers } = setup({ fast: sizes });
    const result = await service.suggest('store', { name: 'Panjabi' });
    expect(result.options).toEqual([{ name: 'Size', values: ['S', 'M'] }]);
    expect(tiers).toEqual(['fast']);
  });

  it('gives an empty list when the model is unavailable', async () => {
    const { service } = setup({});
    expect(await service.suggest('store', { name: 'Panjabi' })).toEqual({ options: [] });
  });
});
