import { Inject, Injectable } from '@nestjs/common';

import {
  suggestedOptionsOutputSchema,
  type SuggestedOptionsResponse,
  type SuggestProductOptionsInput,
} from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import type { LlmImage } from '@dakly/providers/llm/llm-driver';

import { AiService } from '../ai/ai.service';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import { ProductsService } from './products.service';
import {
  suggestOptionsFromPhotos,
  suggestOptionsFromTitle,
} from './prompts/suggest-product-options.v1';

type AskArgs = {
  tier: 'fast' | 'vision';
  prompt: { version: string; instructions: string };
  name: string;
  images?: LlmImage[];
};

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ProductOptionSuggestionsService {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductPhotoTagsRepository) private readonly photos: ProductPhotoTagsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // Runs outside any transaction. A model that is busy or off gives an empty list, and the page
  // then shows its plain suggestions instead.
  async suggest(
    storeId: string,
    input: SuggestProductOptionsInput,
  ): Promise<SuggestedOptionsResponse> {
    const product = input.productId ? await this.products.getById(storeId, input.productId) : null;
    const name = input.name || product?.name || '';
    const images = product ? await this.readPhotos(storeId, product.imageFileIds) : [];
    const [fromTitle, fromPhotos] = await Promise.all([
      name ? this.ask(storeId, { tier: 'fast', prompt: suggestOptionsFromTitle, name }) : [],
      images.length
        ? this.ask(storeId, { tier: 'vision', prompt: suggestOptionsFromPhotos, name, images })
        : [],
    ]);
    return { options: mergeOptions([...fromTitle, ...fromPhotos]) };
  }

  private async readPhotos(storeId: string, fileIds: string[]): Promise<LlmImage[]> {
    const found = await Promise.all(
      fileIds.slice(0, MAX_PHOTOS).map(async (fileId) => {
        const file = await this.photos.find(storeId, fileId);
        if (!file) return null;
        const bytes = await this.storage.readBytes(file.objectKey, MAX_PHOTO_BYTES);
        return bytes.kind === 'found'
          ? { contentType: file.contentType, bytes: bytes.bytes }
          : null;
      }),
    );
    return found.filter((image) => image !== null);
  }

  private async ask(storeId: string, { tier, prompt, name, images }: AskArgs) {
    const result = await this.ai.run(storeId, {
      tier,
      purpose: 'suggest_product_options',
      prompt,
      input: JSON.stringify({ title: name }),
      images,
      output: suggestedOptionsOutputSchema,
    });
    return result.kind === 'output' ? result.output.options : [];
  }
}

// The title and the photos can name the same option, so values join under one name.
function mergeOptions(
  options: SuggestedOptionsResponse['options'],
): SuggestedOptionsResponse['options'] {
  const merged = new Map<string, { name: string; values: string[] }>();
  for (const option of options) {
    const key = option.name.toLowerCase();
    const existing = merged.get(key) ?? { name: option.name, values: [] };
    for (const value of option.values)
      if (!existing.values.some((known) => known.toLowerCase() === value.toLowerCase()))
        existing.values.push(value);
    merged.set(key, existing);
  }
  return [...merged.values()].filter((option) => option.values.length).slice(0, 3);
}
