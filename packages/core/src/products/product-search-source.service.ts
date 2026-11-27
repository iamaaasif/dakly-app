import { Inject, Injectable } from '@nestjs/common';

import { ProductSearchRepository } from './product-search.repository';

export type ProductSearchCandidate = {
  id: string;
  name: string;
  aliases: string[];
  category: string | null;
  description: string | null;
  optionValues: string[];
  pricesPoisha: number[];
};
export type ProductSearchSource = Omit<ProductSearchCandidate, 'pricesPoisha'> & {
  searchTextHash: string | null;
};

@Injectable()
export class ProductSearchSourceService {
  constructor(
    @Inject(ProductSearchRepository) private readonly repository: ProductSearchRepository,
  ) {}

  // Words and prices of every offerable product, for ranking a customer's words against them.
  async listSearchCandidates(storeId: string, limit: number): Promise<ProductSearchCandidate[]> {
    const rows = await this.repository.listSearchCandidates(storeId, limit);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      category: row.category,
      description: row.description,
      optionValues: row.variants.flatMap((variant) => Object.values(variant.optionValues)),
      pricesPoisha: row.variants.map((variant) => variant.priceOverridePoisha ?? row.pricePoisha),
    }));
  }

  listPostProductNames(storeId: string, limit: number) {
    return this.repository.listPostProductNames(storeId, limit);
  }

  async postProductsByPhotos(storeId: string, fileIds: string[]) {
    if (!fileIds.length) return [];
    return this.repository.findPostProductsByPhotos(storeId, fileIds);
  }

  nearestForChat(
    storeId: string,
    input: { embedding: readonly number[]; model: string; limit: number },
  ) {
    return this.repository.nearestForChat(storeId, input);
  }

  staleSearchProductIds(
    storeId: string,
    input: { after: string | null; model: string; limit: number },
  ) {
    return this.repository.staleSearchProductIds(storeId, input);
  }

  async findSearchSource(storeId: string, id: string): Promise<ProductSearchSource | undefined> {
    const row = await this.repository.findSearchSource(storeId, id);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      category: row.category,
      description: row.description,
      optionValues: row.options.flatMap((option) => option.values),
      searchTextHash: row.searchTextHash,
    };
  }

  saveSearchEmbedding(
    storeId: string,
    id: string,
    input: { embedding: readonly number[]; model: string; textHash: string },
  ) {
    return this.repository.saveSearchEmbedding(storeId, id, input);
  }
}
