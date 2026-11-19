import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type {
  BrandProfile,
  ContentPieceListQuery,
  UpdateContentPieceInput,
} from '@dakly/contracts/content';
import { brandProfiles, contentPieces } from '@dakly/db/schema/social';

import { TenantDatabase } from '../platform/database/tenant-database';

const profileFields = {
  voice: brandProfiles.voice,
  audience: brandProfiles.audience,
  preferredWords: brandProfiles.preferredWords,
  wordsToAvoid: brandProfiles.wordsToAvoid,
  callToActionBn: brandProfiles.callToActionBn,
  callToActionEn: brandProfiles.callToActionEn,
};

const pieceFields = {
  id: contentPieces.id,
  kind: contentPieces.kind,
  language: contentPieces.language,
  body: contentPieces.body,
  createdByUserId: contentPieces.createdByUserId,
  isAiWritten: contentPieces.isAiWritten,
  aiRunId: contentPieces.aiRunId,
  createdAt: contentPieces.createdAt,
  updatedAt: contentPieces.updatedAt,
};

@Injectable()
export class ContentRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findBrandProfile(storeId: string) {
    const [profile] = await this.database.forStore(storeId, (tx) =>
      tx.select(profileFields).from(brandProfiles).where(eq(brandProfiles.storeId, storeId)),
    );
    return profile;
  }

  async saveBrandProfile(storeId: string, input: BrandProfile, userId: string, now: Date) {
    const values = { ...input, updatedByUserId: userId, updatedAt: now };
    const [profile] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(brandProfiles)
        .values({ storeId, ...values })
        .onConflictDoUpdate({ target: brandProfiles.storeId, set: values })
        .returning(profileFields),
    );
    return profile!;
  }

  listPieces(storeId: string, { kind, language, cursor, limit }: ContentPieceListQuery) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...pieceFields,
          cursorTime: sql<string>`to_char(${contentPieces.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(contentPieces)
        .where(
          and(
            eq(contentPieces.storeId, storeId),
            kind && eq(contentPieces.kind, kind),
            language && eq(contentPieces.language, language),
            cursor
              ? sql`(${contentPieces.createdAt}, ${contentPieces.id}) <
                (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(contentPieces.createdAt), desc(contentPieces.id))
        .limit(limit + 1),
    );
  }

  async findPiece(storeId: string, id: string) {
    const [piece] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(pieceFields)
        .from(contentPieces)
        .where(and(eq(contentPieces.storeId, storeId), eq(contentPieces.id, id))),
    );
    return piece;
  }

  async createPiece(
    storeId: string,
    input: Pick<
      typeof contentPieces.$inferInsert,
      'kind' | 'language' | 'body' | 'isAiWritten' | 'aiRunId'
    >,
    userId: string,
    now: Date,
  ) {
    const [piece] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(contentPieces)
        .values({ ...input, storeId, createdByUserId: userId, createdAt: now, updatedAt: now })
        .returning(pieceFields),
    );
    return piece!;
  }

  async updatePiece(
    storeId: string,
    id: string,
    { kind, language, body }: UpdateContentPieceInput,
    now: Date,
  ) {
    const [piece] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(contentPieces)
        .set({ kind, language, body, updatedAt: now })
        .where(and(eq(contentPieces.storeId, storeId), eq(contentPieces.id, id)))
        .returning(pieceFields),
    );
    return piece;
  }

  async deletePiece(storeId: string, id: string) {
    const [piece] = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(contentPieces)
        .where(and(eq(contentPieces.storeId, storeId), eq(contentPieces.id, id)))
        .returning({ id: contentPieces.id }),
    );
    return Boolean(piece);
  }
}
