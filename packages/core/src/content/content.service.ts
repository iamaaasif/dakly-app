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

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { contentPieceNotFound } from './content.errors';
import { ContentRepository } from './content.repository';

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

@Injectable()
export class ContentService {
  constructor(
    @Inject(ContentRepository) private readonly repository: ContentRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
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

  createPiece(storeId: string, actor: Actor, { sourcePieceId, ...input }: CreateContentPieceInput) {
    return this.transaction.run(storeId, async () => {
      const source = sourcePieceId ? await this.getPiece(storeId, sourcePieceId) : undefined;
      const piece = await this.repository.createPiece(
        storeId,
        {
          ...input,
          isAiWritten: source?.isAiWritten ?? false,
          aiRunId: source?.aiRunId ?? null,
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
