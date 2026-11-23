import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { AdLinkSource, AdReadState, AdSuggestionOrigin } from '@dakly/contracts/ad-links';
import { adProductSuggestions, adSources } from '@dakly/db/schema/ad-links';

import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

type Key = { source: AdLinkSource; externalId: string };

@Injectable()
export class AdSourcesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // A later message with no title or picture keeps what an earlier one showed.
  async noteSeen(
    storeId: string,
    { source, externalId }: Key,
    shown: { title: string | null; photoUrl: string | null },
  ): Promise<{ readState: AdReadState; title: string | null; photoUrl: string | null }> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(adSources)
        .values({ id: newId(), storeId, source, externalId, ...shown })
        .onConflictDoUpdate({
          target: [adSources.storeId, adSources.source, adSources.externalId],
          set: {
            title: sql`coalesce(excluded.title, ${adSources.title})`,
            photoUrl: sql`coalesce(excluded.photo_url, ${adSources.photoUrl})`,
            lastSeenAt: sql`now()`,
          },
        })
        .returning({
          readState: adSources.readState,
          title: adSources.title,
          photoUrl: adSources.photoUrl,
        }),
    );
    return row!;
  }

  // One transaction, so a retry after a crash never leaves suggestions from two readings mixed.
  finishReading(
    storeId: string,
    { source, externalId }: Key,
    result: { readState: AdReadState; origin: AdSuggestionOrigin; productIds: string[] },
  ) {
    return this.database.forStore(storeId, async (tx) => {
      await tx
        .delete(adProductSuggestions)
        .where(
          and(
            eq(adProductSuggestions.storeId, storeId),
            eq(adProductSuggestions.source, source),
            eq(adProductSuggestions.externalId, externalId),
          ),
        );
      if (result.productIds.length)
        await tx.insert(adProductSuggestions).values(
          result.productIds.map((productId, position) => ({
            id: newId(),
            storeId,
            source,
            externalId,
            productId,
            origin: result.origin,
            position,
          })),
        );
      await tx
        .update(adSources)
        .set({ readState: result.readState })
        .where(
          and(
            eq(adSources.storeId, storeId),
            eq(adSources.source, source),
            eq(adSources.externalId, externalId),
          ),
        );
    });
  }

  list(storeId: string, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          source: adSources.source,
          externalId: adSources.externalId,
          title: adSources.title,
          photoUrl: adSources.photoUrl,
          lastSeenAt: adSources.lastSeenAt,
        })
        .from(adSources)
        .where(eq(adSources.storeId, storeId))
        .orderBy(desc(adSources.lastSeenAt))
        .limit(limit),
    );
  }

  listAllSuggestions(storeId: string): Promise<(Key & { productId: string })[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          source: adProductSuggestions.source,
          externalId: adProductSuggestions.externalId,
          productId: adProductSuggestions.productId,
        })
        .from(adProductSuggestions)
        .where(eq(adProductSuggestions.storeId, storeId))
        .orderBy(asc(adProductSuggestions.position)),
    );
  }

  async clearSuggestions(storeId: string, { source, externalId }: Key): Promise<boolean> {
    const removed = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(adProductSuggestions)
        .where(
          and(
            eq(adProductSuggestions.storeId, storeId),
            eq(adProductSuggestions.source, source),
            eq(adProductSuggestions.externalId, externalId),
          ),
        )
        .returning({ id: adProductSuggestions.id }),
    );
    return removed.length > 0;
  }

  async listSuggestedProductIds(storeId: string, { source, externalId }: Key): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ productId: adProductSuggestions.productId })
        .from(adProductSuggestions)
        .where(
          and(
            eq(adProductSuggestions.storeId, storeId),
            eq(adProductSuggestions.source, source),
            eq(adProductSuggestions.externalId, externalId),
          ),
        )
        .orderBy(asc(adProductSuggestions.position)),
    );
    return rows.map(({ productId }) => productId);
  }
}
