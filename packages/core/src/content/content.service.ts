import { randomUUID } from 'node:crypto';

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
  type ContentCredits,
  type ContentWriteResult,
} from '@dakly/contracts/content-writing';
import type { ProductResponse } from '@dakly/contracts/products';
import type { StoreAccess } from '@dakly/contracts/team';

import { AiRunsService } from '../ai/ai-runs.service';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { ProductsService } from '../products/products.service';
import { TeamService } from '../team/team.service';
import { UsageService } from '../usage/usage.service';
import { contentPieceNotFound, contentWriteError } from './content.errors';
import { ContentRepository } from './content.repository';
import { contentWritingV2 } from './prompts/content-writing.v2';

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
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(AiRunsService) private readonly aiRuns: AiRunsService,
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
    { sourcePieceId, aiRunId, ...input }: CreateContentPieceInput,
  ) {
    return this.transaction.run(storeId, async () => {
      if (aiRunId && !(await this.aiRuns.hasCompletedContentRun(storeId, aiRunId)))
        throw contentWriteError('CONTENT_DRAFT_INVALID');
      const source = sourcePieceId ? await this.getPiece(storeId, sourcePieceId) : undefined;
      const provenance = aiRunId ?? source?.aiRunId ?? null;
      const piece = await this.repository.createPiece(
        storeId,
        {
          ...input,
          isAiWritten: Boolean(provenance) || (source?.isAiWritten ?? false),
          aiRunId: provenance,
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

  async credits(storeId: string): Promise<ContentCredits> {
    const { allowance, remaining, periodEnd } = await this.usage.summary(storeId, 'ai_content');
    return { allowance, remaining, resetsAt: periodEnd.toISOString() };
  }

  async write(
    storeId: string,
    access: StoreAccess,
    input: ContentWriteInput,
  ): Promise<ContentWriteResult> {
    if (input.productId && !this.team.canAccess(access, 'products', 'view'))
      throw new AppError('PERMISSION_DENIED', PLATFORM_ERRORS.PERMISSION_DENIED);
    const { productId, ...request } = input;
    const [brand, savedProduct] = await Promise.all([
      this.brandProfile(storeId),
      productId ? this.products.getById(storeId, productId) : undefined,
    ]);
    const { facts: product, numbers: supportedNumbers } = savedProduct
      ? productWritingDetails(savedProduct)
      : {};
    const visibleBrand = this.team.canAccess(access, 'social', 'view') ? brand : undefined;
    const quantity = input.operation === 'generate' ? 3 : 1;
    if (!(await this.usage.hasAllowance(storeId, 'ai_content', quantity)))
      throw contentWriteError('CONTENT_CREDITS_UNAVAILABLE');
    const { avoided, limit, hashtags } = writingChoices(input, brand);
    const output = contentWriteOutputSchema.refine(({ options }) =>
      validOptions(options, {
        quantity,
        avoided,
        supportedNumbers,
        pricePoisha: product?.pricePoisha,
        limit,
        hashtags,
      }),
    );
    const result = await this.ai.run(storeId, {
      purpose: 'content',
      usageReference: randomUUID(),
      usageQuantity: quantity,
      tier: 'writer',
      prompt: contentWritingV2,
      input: JSON.stringify({ request, brand: visibleBrand, product, characterLimit: limit }),
      output,
    });
    if (result.kind === 'output') return { ...result.output, aiRunId: result.aiRunId };
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

function productWritingDetails(product: ProductResponse) {
  const facts = {
    name: product.name,
    category: product.category,
    description: product.description,
    variants: product.variants.map((variant) => variant.optionValues),
  };
  const firstPrice = product.variants[0]?.pricePoisha;
  const pricePoisha =
    firstPrice && product.variants.every((variant) => variant.pricePoisha === firstPrice)
      ? firstPrice
      : undefined;
  return { facts: { ...facts, pricePoisha }, numbers: numbersIn(JSON.stringify(facts)) };
}

// A left-out order line is checked like a word to avoid, so the model cannot add it anyway.
function writingChoices(input: ContentWriteInput, brand: BrandProfile) {
  const choices = input.operation === 'generate' ? input : undefined;
  const avoided = [
    ...brand.wordsToAvoid,
    ...(choices?.orderLine === false ? [brand.callToActionBn, brand.callToActionEn] : []),
  ]
    .map((word) => normalize(word ?? ''))
    .filter(Boolean);
  const limit = Math.min(formatLimits[input.kind], lengthLimits[choices?.length ?? 'long']);
  return { avoided, limit, hashtags: choices?.hashtags !== false };
}

const lengthLimits = { short: 300, medium: 700, long: 20_000 } as const;

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
    hashtags: boolean;
  },
): boolean {
  if (options.length !== rules.quantity) return false;
  const drafts = options.map((original) => ({ original, text: normalize(original) }));
  if (new Set(drafts.map(({ text }) => text)).size !== rules.quantity) return false;
  return drafts.every(({ original, text }) => {
    if (!text || original.length > rules.limit || original.includes('\u0000')) return false;
    if (rules.avoided.some((word) => text.includes(word))) return false;
    if (!rules.hashtags && /[#＃]\p{L}/u.test(original)) return false;
    const supportedNumbers = rules.supportedNumbers;
    return !supportedNumbers || validProductNumbers(text, supportedNumbers, rules.pricePoisha);
  });
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
