import { Inject, Injectable } from '@nestjs/common';

import { productPhotoTagsSchema } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { AiService } from '../ai/ai.service';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import { tagProductPhoto } from './prompts/tag-product-photo.v1';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// A model that is down for a moment, not this photo, so the queue should try again.
const transientFailures = new Set([
  'AI_PAUSED',
  'AI_STORE_BUSY',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_REQUEST_FAILED',
  'LLM_INVALID_RESPONSE',
]);

export type TagResult = 'tagged' | 'skipped' | 'retry';

@Injectable()
export class ProductPhotoTagsService {
  constructor(
    @Inject(ProductPhotoTagsRepository) private readonly repository: ProductPhotoTagsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // Runs outside any transaction. Tagging is the shop's own catalogue setup, so it does not draw
  // from the chat allowance and still runs when that is used up; the run and its cost are
  // recorded as `tag_product_photo`. Working assumption until the scan allowance is set.
  async tag(storeId: string, fileId: string): Promise<TagResult> {
    const file = await this.repository.find(storeId, fileId);
    if (!file || file.isTagged) return 'skipped';
    const bytes = await this.storage.readBytes(file.objectKey, MAX_PHOTO_BYTES);
    if (bytes.kind !== 'found') return 'skipped';
    const result = await this.ai.run(storeId, {
      tier: 'vision',
      purpose: 'tag_product_photo',
      prompt: tagProductPhoto,
      input: '{}',
      images: [{ contentType: file.contentType, bytes: bytes.bytes }],
      output: productPhotoTagsSchema,
    });
    if (result.kind === 'output') {
      await this.repository.save(storeId, fileId, result.output);
      return 'tagged';
    }
    const code = result.kind === 'failure' ? result.code : undefined;
    return code && transientFailures.has(code) ? 'retry' : 'skipped';
  }
}
