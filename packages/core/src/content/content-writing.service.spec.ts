import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandProfile } from '@dakly/contracts/content';
import type { ContentWriteInput } from '@dakly/contracts/content-writing';
import type { ProductResponse } from '@dakly/contracts/products';

import type { AiRequest, AiService } from '../ai/ai.service';
import type { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { resetEnvForTests } from '../platform/config/env';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { ProductsService } from '../products/products.service';
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

type Output = { options: string[] };

function writing(run: (request: AiRequest<Output>) => Promise<unknown>) {
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
          variants: [{ optionValues: { Color: 'Green' }, sku: 'private-sku', available: 765 }],
        } as ProductResponse;
      },
    } as unknown as ProductsService,
    { remaining: async () => 10 } as unknown as UsageService,
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
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('CODE_HASH_KEY', Buffer.alloc(32, 9).toString('base64'));
    resetEnvForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });
  it.each(['CHEAP', 'সস্তা', 'Ｃｈｅａｐ'])('rejects a draft containing %s', async (avoided) => {
    const service = writing((request) =>
      modelResponse(request, [`${avoided} scarves`, 'New scarves', 'Pick a scarf']),
    );
    await expect(service.write(storeId, topic)).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
  });

  it('returns one option for an edit', async () => {
    const service = writing((request) => modelResponse(request, ['New scarves']));
    await expect(
      service.write(storeId, {
        operation: 'shorten',
        body: 'Our new scarves are here today',
        kind: 'facebook_post',
        language: 'en',
        tone: 'friendly',
      }),
    ).resolves.toMatchObject({ options: ['New scarves'], aiDraft: { aiRunId } });
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
      service.write(storeId, {
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
        service.write(storeId, {
          operation: 'generate',
          kind: 'product_description',
          productId,
          language: 'en',
          tone: 'friendly',
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_INVALID' });
    },
  );

  it('returns a valid draft when its charge finishes after the writing deadline', async () => {
    vi.useFakeTimers();
    try {
      let charged!: () => void;
      const debit = new Promise<void>((resolve) => {
        charged = resolve;
      });
      const options = ['Cotton scarves', 'Wear a scarf', 'Pick a scarf'];
      const service = writing(async (request) => {
        const response = await modelResponse(request, options);
        await debit;
        return response;
      });
      const outcome = service.write(storeId, topic).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(20_000);
      charged();
      await expect(outcome).resolves.toMatchObject({ options });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails after twenty seconds when the model does not settle', async () => {
    vi.useFakeTimers();
    try {
      const service = writing(() => new Promise(() => undefined));
      const outcome = expect(service.write(storeId, topic)).rejects.toMatchObject({
        code: 'CONTENT_TIMEOUT',
      });
      await vi.advanceTimersByTimeAsync(20_000);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });
});
