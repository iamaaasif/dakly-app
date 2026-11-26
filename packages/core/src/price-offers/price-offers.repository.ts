import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, exists, gt, gte, inArray, isNotNull, sql } from 'drizzle-orm';

import { conversations, messages } from '@dakly/db/schema/chats';
import { priceOffers } from '@dakly/db/schema/products';

import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

export type OfferParty = { conversationId: string; contactId: string };
export type OfferTurn = OfferParty & { customerMessageId: string };
type OfferWrite = Omit<typeof priceOffers.$inferInsert, 'id' | 'storeId'>;

const offerColumns = {
  contactId: priceOffers.contactId,
  customerMessageId: priceOffers.customerMessageId,
  offeredPricePoisha: priceOffers.offeredPricePoisha,
  step: priceOffers.step,
  expiresAt: priceOffers.expiresAt,
};
const finalFirst = desc(sql`${priceOffers.step} = 'final'`);
@Injectable()
export class PriceOffersRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async isCustomerTurn(storeId: string, turn: OfferTurn): Promise<boolean> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(
          conversations,
          and(eq(conversations.id, messages.conversationId), eq(conversations.storeId, storeId)),
        )
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.id, turn.customerMessageId),
            eq(messages.direction, 'in'),
            eq(messages.conversationId, turn.conversationId),
            eq(conversations.contactId, turn.contactId),
          ),
        ),
    );
    return Boolean(row);
  }

  async forTurn(storeId: string, turn: OfferTurn, productId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(offerColumns)
        .from(priceOffers)
        .where(
          and(
            eq(priceOffers.storeId, storeId),
            eq(priceOffers.conversationId, turn.conversationId),
            eq(priceOffers.productId, productId),
            eq(priceOffers.customerMessageId, turn.customerMessageId),
          ),
        ),
    );
    return row;
  }

  async latestLive(storeId: string, party: OfferParty, productId: string, now: Date) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(offerColumns)
        .from(priceOffers)
        .where(
          and(
            offerParty(storeId, party),
            eq(priceOffers.productId, productId),
            gt(priceOffers.expiresAt, now),
            sentOffer(tx),
          ),
        )
        .orderBy(finalFirst, desc(priceOffers.expiresAt), desc(priceOffers.id))
        .limit(1),
    );
    return row;
  }

  async insert(storeId: string, offer: OfferWrite): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      await tx.insert(priceOffers).values({ storeId, ...offer });
    });
  }

  forOrder(storeId: string, party: OfferParty, productIds: string[], now: Date) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          productId: priceOffers.productId,
          offeredPricePoisha: priceOffers.offeredPricePoisha,
        })
        .from(priceOffers)
        .where(
          and(
            offerParty(storeId, party),
            gt(priceOffers.expiresAt, now),
            sentOffer(tx),
            inArray(priceOffers.productId, productIds),
          ),
        )
        .orderBy(finalFirst, desc(priceOffers.expiresAt), desc(priceOffers.id)),
    );
  }
}

function offerParty(storeId: string, party: OfferParty) {
  return and(
    eq(priceOffers.storeId, storeId),
    eq(priceOffers.conversationId, party.conversationId),
    eq(priceOffers.contactId, party.contactId),
  );
}

function sentOffer(tx: Transaction) {
  const ref = sql`${priceOffers.customerMessageId}::text || ':' || ${priceOffers.productId}::text`;
  return exists(
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.storeId, priceOffers.storeId),
          eq(messages.conversationId, priceOffers.conversationId),
          eq(messages.direction, 'out'),
          eq(messages.authorType, 'ai'),
          isNotNull(messages.sentAt),
          gte(messages.createdAt, sql`${priceOffers.expiresAt} - interval '24 hours'`),
          inArray(messages.status, ['sent', 'delivered', 'read']),
          sql`${messages.aiSources} @> jsonb_build_array(jsonb_build_object('tool', 'price_offer', 'refs', jsonb_build_array(${ref})))`,
        ),
      ),
  );
}
