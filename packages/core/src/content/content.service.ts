import { randomUUID, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  BrandProfile,
  ContentPiece,
  ContentPieceList,
  ContentPieceListQuery,
  CreateContentPieceInput,
  UpdateContentPieceInput,
} from '@dakly/contracts/content';
import {
  contentWriteOutputSchema,
  type ContentWriteInput,
  type ContentWriteResult,
} from '@dakly/contracts/content-writing';

import { AiService } from '../ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { hashCode } from '../platform/crypto/code-hash';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductsService } from '../products/products.service';
import { UsageService } from '../usage/usage.service';
import { contentPieceNotFound, contentWriteError } from './content.errors';
import { ContentRepository } from './content.repository';
import { contentWritingV1 } from './prompts/content-writing.v1';

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

@Injectable()
export class ContentService {
  constructor(
    @Inject(ContentRepository) private readonly repository: ContentRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async brandProfile(storeId: string): Promise<BrandProfile> {
    return (
      (await this.repository.findBrandProfile(storeId)) ?? {
        voice: null,
        audience: null,
        preferredWords: [],
        wordsToAvoid: [],
        callToActionBn: null,
        callToActionEn: null,
      }
    );
  }

  saveBrandProfile(storeId: string, actor: Actor, input: BrandProfile): Promise<BrandProfile> {
    return this.transaction.run(storeId, async () => {
      const profile = await this.repository.saveBrandProfile(
        storeId,
        input,
        actor.userId,
        this.clock.now(),
      );
      await this.audit.record(storeId, {
        actor,
        action: 'brand_profile.saved',
        entityType: 'brand_profile',
        entityId: storeId,
      });
      return profile;
    });
  }

  async listPieces(storeId: string, query: ContentPieceListQuery): Promise<ContentPieceList> {
    const rows = await this.repository.listPieces(storeId, query);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ cursorTime: _, ...piece }) => toPiece(piece)),
      nextCursor: last && rows.length > query.limit ? `${last.cursorTime}_${last.id}` : null,
    };
  }

  async getPiece(storeId: string, id: string): Promise<ContentPiece> {
    const piece = await this.repository.findPiece(storeId, id);
    if (!piece) throw contentPieceNotFound();
    return toPiece(piece);
  }

  createPiece(
    storeId: string,
    actor: Actor,
    { sourcePieceId, aiDraft, ...input }: CreateContentPieceInput,
  ) {
    if (aiDraft) {
      const expected = draftProof(storeId, aiDraft.aiRunId);
      if (!timingSafeEqual(Buffer.from(aiDraft.proof), Buffer.from(expected)))
        throw contentWriteError('CONTENT_DRAFT_INVALID');
    }
    return this.transaction.run(storeId, async () => {
      const source = sourcePieceId ? await this.getPiece(storeId, sourcePieceId) : undefined;
      const aiRunId = aiDraft?.aiRunId ?? source?.aiRunId ?? null;
      const piece = await this.repository.createPiece(
        storeId,
        {
          ...input,
          isAiWritten: Boolean(aiRunId) || (source?.isAiWritten ?? false),
          aiRunId,
        },
        actor.userId,
        this.clock.now(),
      );
      await this.recordPieceChange(storeId, actor, piece.id, 'created');
      return toPiece(piece);
    });
  }

  updatePiece(storeId: string, id: string, actor: Actor, input: UpdateContentPieceInput) {
    return this.transaction.run(storeId, async () => {
      const piece = await this.repository.updatePiece(storeId, id, input, this.clock.now());
      if (!piece) throw contentPieceNotFound();
      await this.recordPieceChange(storeId, actor, id, 'updated');
      return toPiece(piece);
    });
  }

  deletePiece(storeId: string, id: string, actor: Actor) {
    return this.transaction.run(storeId, async () => {
      if (!(await this.repository.deletePiece(storeId, id))) throw contentPieceNotFound();
      await this.recordPieceChange(storeId, actor, id, 'deleted');
    });
  }

  async write(storeId: string, input: ContentWriteInput): Promise<ContentWriteResult> {
    if (!loadEnv().CODE_HASH_KEY) throw contentWriteError('CONTENT_UNAVAILABLE');
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(contentWriteError('CONTENT_TIMEOUT'));
      }, 20_000);
    });
    try {
      return await Promise.race([
        this.writeOptions(storeId, input, abort.signal, () => clearTimeout(timer)),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async writeOptions(
    storeId: string,
    input: ContentWriteInput,
    signal: AbortSignal,
    acceptOutput: () => void,
  ) {
    const { productId, ...request } = input;
    const [brand, savedProduct] = await Promise.all([
      this.brandProfile(storeId),
      productId ? this.products.getById(storeId, productId) : undefined,
    ]);
    const productFacts = savedProduct && {
      name: savedProduct.name,
      category: savedProduct.category,
      description: savedProduct.description,
      variants: savedProduct.variants.map((variant) => variant.optionValues),
    };
    const pricePoisha = savedProduct?.pricePoisha;
    const product = productFacts && { ...productFacts, pricePoisha };
    const quantity = input.operation === 'generate' ? 3 : 1;
    if ((await this.usage.remaining(storeId, 'ai_content')) < quantity)
      throw contentWriteError('CONTENT_CREDITS_UNAVAILABLE');
    const avoided = brand.wordsToAvoid.map(normalize).filter(Boolean);
    const supportedNumbers = productFacts && numbersIn(JSON.stringify(productFacts));
    const limit = formatLimits[input.kind];
    const output = contentWriteOutputSchema.refine(({ options }) => {
      const valid = validOptions(options, {
        quantity,
        avoided,
        supportedNumbers,
        pricePoisha,
        limit,
      });
      // A valid draft can now be charged. Wait for that charge so the caller gets the draft.
      if (valid) acceptOutput();
      return valid;
    });
    const result = await this.ai.run(storeId, {
      purpose: 'content',
      usageReference: randomUUID(),
      usageQuantity: quantity,
      tier: 'writer',
      prompt: contentWritingV1,
      input: JSON.stringify({ request, brand, product, characterLimit: limit }),
      output,
      signal,
    });
    if (result.kind === 'output') {
      const { aiRunId } = result;
      return { ...result.output, aiDraft: { aiRunId, proof: draftProof(storeId, aiRunId) } };
    }
    throw writingFailure(result.kind === 'tool_calls' ? 'AI_OUTPUT_MISMATCH' : result.code);
  }

  private recordPieceChange(
    storeId: string,
    actor: Actor,
    id: string,
    action: 'created' | 'updated' | 'deleted',
  ) {
    return this.audit.record(storeId, {
      actor,
      action: `content_piece.${action}`,
      entityType: 'content_piece',
      entityId: id,
    });
  }
}

type PieceRow = Awaited<ReturnType<ContentRepository['createPiece']>>;

function toPiece({ createdAt, updatedAt, ...piece }: PieceRow): ContentPiece {
  return { ...piece, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

const formatLimits: Record<ContentWriteInput['kind'], number> = {
  facebook_post: 20_000,
  instagram_caption: 2200,
  whatsapp: 4096,
  sms: 1000,
  product_description: 10_000,
};

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));
}

function numbersIn(text: string): string[] {
  return toAsciiDigits(text.normalize('NFKC')).match(/\p{N}+/gu) ?? [];
}

const namedPrice =
  /(?:৳|\b(?:bdt|tk|taka)\b|টাকা)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:৳|\b(?:bdt|tk|taka)\b|টাকা)/giu;
const stockOrDiscount =
  /\b(?:in stock|out of stock|sold out|[0-9]+ left|discount|discounted|off [0-9]+|stok|stock ache|stock nei)\b|[%٪]|স্টকে|স্টক শেষ|ডিসকাউন্ট|শতাংশ/u;

function validProductNumbers(text: string, supportedNumbers: string[], pricePoisha?: number) {
  if (stockOrDiscount.test(toAsciiDigits(text))) return false;
  let validPrices = true;
  const withoutPrices = toAsciiDigits(text).replace(
    namedPrice,
    (_price, prefix: string | undefined, suffix: string | undefined) => {
      const [taka, poisha = ''] = (prefix ?? suffix ?? '').replaceAll(',', '').split('.');
      const statedPoisha = Number(taka) * 100 + Number(poisha.padEnd(2, '0'));
      if (!pricePoisha || statedPoisha !== pricePoisha) validPrices = false;
      return ' ';
    },
  );
  return (
    validPrices && numbersIn(withoutPrices).every((number) => supportedNumbers.includes(number))
  );
}

function validOptions(
  options: string[],
  rules: {
    quantity: number;
    avoided: string[];
    supportedNumbers?: string[];
    pricePoisha?: number;
    limit: number;
  },
): boolean {
  if (options.length !== rules.quantity) return false;
  const drafts = options.map((original) => ({ original, text: normalize(original) }));
  if (new Set(drafts.map(({ text }) => text)).size !== rules.quantity) return false;
  return drafts.every(({ original, text }) => {
    if (!text || original.length > rules.limit || original.includes('\u0000')) return false;
    if (rules.avoided.some((word) => text.includes(word))) return false;
    const supportedNumbers = rules.supportedNumbers;
    return !supportedNumbers || validProductNumbers(text, supportedNumbers, rules.pricePoisha);
  });
}

// Bind a draft to its shop without storing model output before a person chooses to save it.
function draftProof(storeId: string, aiRunId: string): string {
  return hashCode(loadEnv().CODE_HASH_KEY, JSON.stringify(['content-draft', storeId, aiRunId]));
}

function writingFailure(code: string) {
  switch (code) {
    case 'AI_OUTPUT_MISMATCH':
      return contentWriteError('CONTENT_INVALID');
    case 'USAGE_ALLOWANCE_EXCEEDED':
      return contentWriteError('CONTENT_CREDITS_UNAVAILABLE');
    case 'LLM_TIMEOUT':
    case 'LLM_ABORTED':
      return contentWriteError('CONTENT_TIMEOUT');
    default:
      return contentWriteError('CONTENT_UNAVAILABLE');
  }
}
