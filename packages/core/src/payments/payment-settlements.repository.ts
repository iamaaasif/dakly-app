import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { gatewaySettlementLines, paymentIntents } from '@dakly/db/schema/payments';

import { TenantDatabase } from '../platform/database/tenant-database';

const lines = gatewaySettlementLines;

@Injectable()
export class PaymentSettlementsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  candidates(storeId: string, after: string | null, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          lineId: lines.id,
          amountPoisha: lines.amountPoisha,
          verifiedAmountPoisha: paymentIntents.verifiedAmountPoisha,
        })
        .from(lines)
        .innerJoin(
          paymentIntents,
          and(
            eq(lines.gateway, paymentIntents.gateway),
            eq(lines.gatewayTransactionId, paymentIntents.gatewayTransactionId),
          ),
        )
        .where(
          and(
            eq(paymentIntents.storeId, storeId),
            eq(paymentIntents.flow, 'billing'),
            eq(paymentIntents.isSandbox, false),
            eq(lines.status, 'unmatched'),
            after ? gt(lines.id, after) : undefined,
          ),
        )
        .orderBy(asc(lines.id))
        .limit(limit),
    );
  }

  async match(storeId: string, ids: string[], now: Date) {
    await this.database.forStore(storeId, async (tx) => {
      const matched = await tx
        .update(lines)
        .set({
          status: 'matched',
          paymentIntentId: paymentIntents.id,
          matchedAt: now,
          updatedAt: now,
        })
        .from(paymentIntents)
        .where(
          and(
            inArray(lines.id, ids),
            eq(lines.status, 'unmatched'),
            eq(lines.gateway, paymentIntents.gateway),
            eq(lines.gatewayTransactionId, paymentIntents.gatewayTransactionId),
            eq(lines.amountPoisha, paymentIntents.verifiedAmountPoisha),
            eq(paymentIntents.storeId, storeId),
            eq(paymentIntents.flow, 'billing'),
            eq(paymentIntents.isSandbox, false),
          ),
        )
        .returning({ intentId: paymentIntents.id });
      if (matched.length === 0) return;
      await tx
        .update(paymentIntents)
        .set({ settledAt: now, updatedAt: now })
        .where(
          and(
            eq(paymentIntents.storeId, storeId),
            isNull(paymentIntents.settledAt),
            inArray(
              paymentIntents.id,
              matched.map(({ intentId }) => intentId),
            ),
          ),
        );
    });
  }
}
