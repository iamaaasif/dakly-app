import { Inject, Injectable } from '@nestjs/common';

import { LlmError } from '@dakly/providers/llm/llm-driver';

import { AiService } from '../ai/ai.service';
import { AppError } from '../platform/errors/app-error';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { ProductsService, type ChatProduct } from '../products/products.service';
import { pickAlternatives } from './product-alternatives';
import { decidePhotoMatch, isSellable, type PhotoMatch } from './product-photo-match';
import {
  fuseRanks,
  fitsPrice,
  nameScores,
  parseQuery,
  rankByWords,
} from './product-search-ranking';

export type { PhotoMatch };

// A shop's catalogue is ranked in memory; a store past this size needs the ranking moved into SQL.
const candidateLimit = 2000;
// Cosine distance beyond which a product is no closer to the question than to any other text.
const maxMeaningDistance = 0.55;
const meaningLimit = 20;
const alternativeLimit = 3;

@Injectable()
export class ProductSearchService {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductSearchSourceService) private readonly source: ProductSearchSourceService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  // Finds what a customer asks for in Bangla, Banglish or English. Products the shop can sell now come first.
  async search(storeId: string, text: string, limit: number): Promise<ChatProduct[]> {
    const { found } = await this.rank(storeId, text, false);
    return [...found.filter(isSellable), ...found.filter((product) => !isSellable(product))].slice(
      0,
      limit,
    );
  }

  // Search limited to the products an ad sells, by spelling only: a pick such as "নীলটা" names a
  // colour of one of at most four products, so meaning-based hits from the rest of the shop would only add guesses.
  async searchWithin(
    storeId: string,
    productIds: readonly string[],
    text: string,
    limit: number,
  ): Promise<ChatProduct[]> {
    const allowed = new Set(productIds);
    const candidates = (await this.source.listSearchCandidates(storeId, candidateLimit)).filter(
      ({ id }) => allowed.has(id),
    );
    const found = await this.products.getManyForChat(
      storeId,
      rankByWords(candidates, parseQuery(text)),
    );
    return [...found.filter(isSellable), ...found.filter((product) => !isSellable(product))].slice(
      0,
      limit,
    );
  }

  // Matches the words and meaning of a customer's photo, as CHAT-7 read them, to the shop's products.
  async matchPhoto(storeId: string, photoText: string): Promise<PhotoMatch> {
    const { found, scores, words } = await this.rank(storeId, photoText, true);
    return decidePhotoMatch(found, scores, words);
  }

  // In-stock products to offer in place of a sold-out one.
  async alternativesFor(storeId: string, soldOut: ChatProduct): Promise<ChatProduct[]> {
    if (!soldOut.category) return [];
    const candidates = await this.source.listSearchCandidates(storeId, candidateLimit);
    const sameCategory = candidates
      .filter(({ id, category }) => id !== soldOut.id && category === soldOut.category)
      .map(({ id }) => id);
    return pickAlternatives(
      soldOut,
      await this.products.getManyForChat(storeId, sameCategory),
      alternativeLimit,
    );
  }

  private async rank(storeId: string, text: string, isPhoto: boolean) {
    const query = parseQuery(text);
    const candidates = await this.source.listSearchCandidates(storeId, candidateLimit);
    const byWords = rankByWords(candidates, query);
    const priced = new Set(
      candidates.filter((candidate) => fitsPrice(candidate, query)).map(({ id }) => id),
    );
    const byMeaning = query.words.length ? await this.rankByMeaning(storeId, text) : [];
    const scores = nameScores(candidates, query.words);
    const fused = fuseRanks(
      byWords,
      byMeaning.filter((id) => priced.has(id)),
    );
    // A photo's text is long, so a named product's share of its words can fall under the spelling cut.
    const ids = isPhoto ? [...new Set([...fused, ...scores.keys()])] : fused;
    // Hydrate every match so the sold-out ones can be moved behind the rest before the cut.
    const found = await this.products.getManyForChat(storeId, ids);
    return { found, scores, words: query.words };
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

// A paused or busy AI is expected; any other AppError, such as a call inside a transaction, is a bug.
function isAiUnavailable(error: unknown): boolean {
  if (error instanceof LlmError) return true;
  return (
    error instanceof AppError && (error.code === 'AI_PAUSED' || error.code === 'AI_STORE_BUSY')
  );
}
