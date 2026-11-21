import { Inject, Injectable } from '@nestjs/common';

import { LlmError } from '@dakly/providers/llm/llm-driver';

import { AiService } from '../ai/ai.service';
import { AppError } from '../platform/errors/app-error';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { ProductsService, type ChatProduct } from '../products/products.service';
import { fuseRanks, fitsPrice, parseQuery, rankByWords } from './product-search-ranking';

// A shop's catalogue is ranked in memory; a store past this size needs the ranking moved into SQL.
const candidateLimit = 2000;
// Cosine distance beyond which a product is no closer to the question than to any other text.
const maxMeaningDistance = 0.55;
const meaningLimit = 20;

@Injectable()
export class ProductSearchService {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductSearchSourceService) private readonly source: ProductSearchSourceService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  // Finds what a customer asks for in Bangla, Banglish or English. Products the shop can sell now come first.
  async search(storeId: string, text: string, limit: number): Promise<ChatProduct[]> {
    const query = parseQuery(text);
    const candidates = await this.source.listSearchCandidates(storeId, candidateLimit);
    const byWords = rankByWords(candidates, query);
    const priced = new Set(
      candidates.filter((candidate) => fitsPrice(candidate, query)).map(({ id }) => id),
    );
    const byMeaning = query.words.length ? await this.rankByMeaning(storeId, text) : [];
    const ids = fuseRanks(
      byWords,
      byMeaning.filter((id) => priced.has(id)),
    );
    // Hydrate every match so the sold-out ones can be moved behind the rest before the cut.
    const found = await this.products.getManyForChat(storeId, ids);
    return [...found.filter(isSellable), ...found.filter((product) => !isSellable(product))].slice(
      0,
      limit,
    );
  }

  // Embedding the question costs a call; when the AI is paused or failing, spelling alone still answers.
  private async rankByMeaning(storeId: string, text: string): Promise<string[]> {
    try {
      const {
        embeddings: [embedding],
        model,
      } = await this.ai.embed(storeId, [text]);
      if (!embedding) return [];
      const nearest = await this.source.nearestForChat(storeId, {
        embedding,
        model,
        limit: meaningLimit,
      });
      return nearest.filter(({ distance }) => distance <= maxMeaningDistance).map(({ id }) => id);
    } catch (error) {
      if (isAiUnavailable(error)) return [];
      throw error;
    }
  }
}

function isSellable(product: ChatProduct): boolean {
  return !product.isStockTracked || product.variants.some((variant) => variant.available > 0);
}

// A paused or busy AI is expected; any other AppError, such as a call inside a transaction, is a bug.
function isAiUnavailable(error: unknown): boolean {
  if (error instanceof LlmError) return true;
  return (
    error instanceof AppError && (error.code === 'AI_PAUSED' || error.code === 'AI_STORE_BUSY')
  );
}
