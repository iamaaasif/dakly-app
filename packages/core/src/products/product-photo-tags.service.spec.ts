import { describe, expect, it } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import { ProductPhotoTagsService } from './product-photo-tags.service';

const fileId = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const tags = { description: 'A red cotton kurti.', tags: ['red', 'লাল', 'kurti', 'কুর্তি'] };

function setup(options: {
  tagged?: boolean;
  reply?: { kind: 'output'; output: typeof tags } | { kind: 'failure'; code: string };
}) {
  const saved: unknown[] = [];
  let modelCalls = 0;
  const service = new ProductPhotoTagsService(
    {
      find: async () => ({ objectKey: 'k', contentType: 'image/png', isTagged: !!options.tagged }),
      save: async (_store: string, _file: string, value: unknown) => void saved.push(value),
    } as unknown as ProductPhotoTagsRepository,
    {
      run: async () => {
        modelCalls += 1;
        return options.reply ?? { kind: 'output', output: tags };
      },
    } as unknown as AiService,
    { readBytes: async () => ({ kind: 'found', bytes: new Uint8Array([1]) }) } as never,
  );
  return { service, saved, calls: () => modelCalls };
}

describe('product photo tags', () => {
  it('saves what the model saw in an untagged photo', async () => {
    const { service, saved } = setup({});
    expect(await service.tag('store', fileId)).toBe('tagged');
    expect(saved).toEqual([tags]);
  });

  it('does not call the model for a photo that already has tags', async () => {
    const { service, calls } = setup({ tagged: true });
    expect(await service.tag('store', fileId)).toBe('skipped');
    expect(calls()).toBe(0);
  });

  it('asks the queue to retry a model outage but not a refused photo', async () => {
    expect(
      await setup({ reply: { kind: 'failure', code: 'LLM_UNAVAILABLE' } }).service.tag(
        'store',
        fileId,
      ),
    ).toBe('retry');
    expect(
      await setup({ reply: { kind: 'failure', code: 'LLM_REFUSED' } }).service.tag('store', fileId),
    ).toBe('skipped');
  });
});
