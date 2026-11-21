import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import { ProductSearchSourceService } from '../products/product-search-source.service';

// What the embedding is built from: every word a shopper could use for the product.
export function buildSearchText(source: {
  name: string;
  aliases: string[];
  category: string | null;
  description: string | null;
  optionValues: string[];
}): string {
  return [
    source.name,
    ...source.aliases,
    source.category,
    ...source.optionValues,
    source.description,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n');
}

@Injectable()
export class ProductSearchIndexService {
  constructor(
    @Inject(ProductSearchSourceService) private readonly products: ProductSearchSourceService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  async index(storeId: string, productId: string): Promise<void> {
    const source = await this.products.findSearchSource(storeId, productId);
    if (!source) return;
    const text = buildSearchText(source);
    const textHash = createHash('sha256').update(text).digest('hex');
    if (source.searchTextHash === textHash) return;
    const {
      embeddings: [embedding],
      model,
    } = await this.ai.embed(storeId, [text]);
    if (!embedding) throw new Error('Embedding result is missing a vector');
    await this.products.saveSearchEmbedding(storeId, productId, { embedding, model, textHash });
  }
}
