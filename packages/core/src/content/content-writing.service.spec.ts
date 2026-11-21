import { describe, expect, it } from 'vitest';

import type { BrandProfile } from '@dakly/contracts/content';
import type { ContentWriteInput } from '@dakly/contracts/content-writing';
import type { ProductResponse } from '@dakly/contracts/products';
import type { StoreAccess } from '@dakly/contracts/team';

import type { AiRunsService } from '../ai/ai-runs.service';
import type { AiRequest, AiService } from '../ai/ai.service';
import type { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { ProductsService } from '../products/products.service';
import type { TeamService } from '../team/team.service';
import type { UsageService } from '../usage/usage.service';
import type { ContentRepository } from './content.repository';
import { ContentService } from './content.service';

const storeId = '40e63a5e-4024-45c1-aada-dd7566a54876';
const productId = '9f99e63a-fa1d-4d86-b1de-48fb9059c03d';
const aiRunId = 'e82b0bbf-ceb9-4e58-b46b-9327e94d781d';
const topic: ContentWriteInput = {
  operation: 'generate',
  kind: 'facebook_post',
  topic: 'New scarves',
  language: 'en',
  tone: 'friendly',
};
const profile: BrandProfile = {
  voice: 'Warm',
  audience: null,
  preferredWords: [],
  wordsToAvoid: ['cheap', 'সস্তা'],
  callToActionBn: null,
  callToActionEn: 'Send a message',
};

const access: StoreAccess = {
  role: 'custom',
  areas: { products: 'edit', social: 'edit' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
};

type Output = { options: string[] };

function writing(run: (request: AiRequest<Output>) => Promise<unknown>, prices = [31337]) {
  return new ContentService(
    { findBrandProfile: async () => profile } as unknown as ContentRepository,
    new Clock(),
    {} as StoreTransaction,
    {} as AuditService,
    { run: (_storeId: string, request: AiRequest<Output>) => run(request) } as unknown as AiService,
    {
      getById: async (requestedStore: string, id: string) => {
        if (requestedStore !== storeId || id !== productId) throw new Error('Wrong product');
        return {
          name: 'Cotton scarf 42',
          category: 'Accessories',
          description: 'Cotton with stitched edges',
          pricePoisha: 31337,
          variants: prices.map((pricePoisha) => ({
            optionValues: { Color: 'Green' },
            sku: 'private-sku',
            available: 765,
            pricePoisha,
          })),
        } as ProductResponse;
      },
    } as unknown as ProductsService,
    { hasAllowance: async () => true } as unknown as UsageService,
    {
      canAccess: (access: StoreAccess, area: 'products' | 'social') =>
        ['view', 'edit'].includes(access.areas[area] ?? ''),
    } as unknown as TeamService,
    {} as AiRunsService,
  );
}

function modelResponse(request: AiRequest<Output>, options: string[]) {
  const parsed = request.output.safeParse({ options });
  return Promise.resolve(
    parsed.success
      ? { kind: 'output', output: parsed.data, aiRunId }
      : { kind: 'failure', code: 'AI_OUTPUT_MISMATCH', aiRunId },
  );
}

describe('ContentService writing', () => {
  it.each(['CHEAP', 'সস্তা', 'Ｃｈｅａｐ'])('rejects a draft containing %s', async (avoided) => {
    const service = writing((request) =>
      modelResponse(request, [`${avoided} scarves`, 'New scarves', 'Pick a scarf']),
    );
    await expect(service.write(storeId, access, topic)).rejects.toMatchObject({
      code: 'CONTENT_INVALID',
    });
  });

  it('passes the length, hashtag and order line choices to the model', async () => {
    let input = '';
    const service = writing((request) => {
      input = request.input;
      return modelResponse(request, ['One', 'Two', 'Three']);
    });
    await service.write(storeId, access, {
      ...topic,
      length: 'short',
      hashtags: false,
      orderLine: false,
    });
    expect(JSON.parse(input).request).toMatchObject({
      length: 'short',
      hashtags: false,
      orderLine: false,
    });
  });

  it('rejects a draft longer than the chosen length', async () => {
    const long = 'a'.repeat(301);
    const service = writing((request) => modelResponse(request, [long, 'Two', 'Three']));
    await expect(
      service.write(storeId, access, { ...topic, length: 'short' }),
    ).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
    await expect(service.write(storeId, access, topic)).resolves.toMatchObject({
      options: [long, 'Two', 'Three'],
    });
  });

  it('rejects a hashtag when hashtags are switched off', async () => {
    const service = writing((request) =>
      modelResponse(request, ['New scarves #winter', 'Two', 'Three']),
    );
    await expect(
      service.write(storeId, access, { ...topic, hashtags: false }),
    ).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
    await expect(service.write(storeId, access, topic)).resolves.toMatchObject({
      options: ['New scarves #winter', 'Two', 'Three'],
    });
  });

  it('rejects the brand call to action when the order line is switched off', async () => {
    const service = writing((request) =>
      modelResponse(request, ['New scarves. Send a message to order.', 'Two', 'Three']),
    );
    await expect(
      service.write(storeId, access, { ...topic, orderLine: false }),
    ).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
    await expect(service.write(storeId, access, topic)).resolves.toMatchObject({
      options: ['New scarves. Send a message to order.', 'Two', 'Three'],
    });
  });

  it('reports the credits left and when they reset', async () => {
    const periodEnd = new Date('2028-02-15T04:00:00Z');
    const service = new ContentService(
      {} as ContentRepository,
      new Clock(),
      {} as StoreTransaction,
      {} as AuditService,
      {} as AiService,
      {} as ProductsService,
      {
        summary: async (store: string, unit: string) =>
          store === storeId && unit === 'ai_content'
            ? { allowance: 100, remaining: 64, periodEnd }
            : undefined,
      } as unknown as UsageService,
      {} as TeamService,
      {} as AiRunsService,
    );
    await expect(service.credits(storeId)).resolves.toEqual({
      allowance: 100,
      remaining: 64,
      resetsAt: '2028-02-15T04:00:00.000Z',
    });
  });

  it('returns one option for an edit', async () => {
    const service = writing((request) => modelResponse(request, ['New scarves']));
    await expect(
      service.write(storeId, access, {
        operation: 'shorten',
        body: 'Our new scarves are here today',
        kind: 'facebook_post',
        language: 'en',
        tone: 'friendly',
      }),
    ).resolves.toEqual({ options: ['New scarves'], aiRunId });
  });

  it('uses only the named product’s saved public details', async () => {
    const service = writing((request) => {
      const { product } = JSON.parse(request.input);
      expect(product).toEqual({
        name: 'Cotton scarf 42',
        category: 'Accessories',
        description: 'Cotton with stitched edges',
        variants: [{ Color: 'Green' }],
        pricePoisha: 31337,
      });
      return modelResponse(request, [
        'A green cotton scarf with stitched edges.',
        'Cotton scarf 42 comes in green.',
        'A green scarf for everyday wear.',
      ]);
    });
    await expect(
      service.write(storeId, access, {
        operation: 'generate',
        kind: 'product_description',
        productId,
        language: 'en',
        tone: 'friendly',
      }),
    ).resolves.toMatchObject({
      options: expect.arrayContaining(['Cotton scarf 42 comes in green.']),
    });
  });

  it.each(['Cotton scarf for ৳42', 'Cotton scarf with 42 in stock'])(
    'rejects the unsupported product claim "%s"',
    async (claim) => {
      const service = writing((request) =>
        modelResponse(request, [claim, 'Cotton scarf', 'Green scarf']),
      );
      await expect(
        service.write(storeId, access, {
          operation: 'generate',
          kind: 'product_description',
          productId,
          language: 'en',
          tone: 'friendly',
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
    },
  );

  it('keeps a saved profile out of model input for a product editor without social access', async () => {
    const service = writing((request) => {
      expect(JSON.parse(request.input).brand).toBeUndefined();
      return modelResponse(request, ['Cheap scarves', 'Cotton scarf', 'A green scarf']);
    });
    const input: ContentWriteInput = {
      operation: 'generate',
      kind: 'product_description',
      productId,
      language: 'en',
      tone: 'friendly',
    };
    await expect(
      service.write(storeId, { ...access, areas: { products: 'edit' } }, input),
    ).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
  });

  it('rejects a general price when variants sell at different prices', async () => {
    const service = writing(
      (request) => {
        expect(JSON.parse(request.input).product.pricePoisha).toBeUndefined();
        return modelResponse(request, ['Cotton scarf for ৳313.37', 'Cotton scarf', 'Green scarf']);
      },
      [31337, 35000],
    );
    const input: ContentWriteInput = {
      operation: 'generate',
      kind: 'product_description',
      productId,
      language: 'en',
      tone: 'friendly',
    };
    await expect(service.write(storeId, access, input)).rejects.toMatchObject({
      code: 'CONTENT_INVALID',
    });
  });

  it.each(['LLM_TIMEOUT', 'LLM_ABORTED'])(
    'returns a retryable writing error on %s',
    async (code) => {
      const service = writing(async () => ({ kind: 'failure', code }));
      await expect(service.write(storeId, access, topic)).rejects.toMatchObject({
        code: 'CONTENT_TIMEOUT',
        status: 504,
      });
    },
  );
});
