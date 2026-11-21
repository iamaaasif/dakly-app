import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  paymentEvents,
  paymentGatewayCredentials,
  paymentIntents,
} from '@dakly/db/schema/payments';
import type { PaymentGateway } from '@dakly/providers/payment/payment-driver';

import { isConstraintViolation } from '../platform/database/error-code';
import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

type IntentInsert = typeof paymentIntents.$inferInsert;
type EventInsert = typeof paymentEvents.$inferInsert;
type IntentUpdate = Pick<
  IntentInsert,
  | 'status'
  | 'gatewayPaymentId'
  | 'gatewayTransactionId'
  | 'reviewReason'
  | 'verifiedAmountPoisha'
  | 'succeededAt'
  | 'nextCheckAt'
  | 'checkCount'
  | 'updatedAt'
>;

const intentColumns = {
  id: paymentIntents.id,
  flow: paymentIntents.flow,
  purpose: paymentIntents.purpose,
  orderId: paymentIntents.orderId,
  verifiedAmountPoisha: paymentIntents.verifiedAmountPoisha,
  refundedPoisha: paymentIntents.refundedPoisha,
  gateway: paymentIntents.gateway,
  credentialId: paymentIntents.credentialId,
  amountPoisha: paymentIntents.amountPoisha,
  currency: paymentIntents.currency,
  merchantReference: paymentIntents.merchantReference,
  shortCode: paymentIntents.shortCode,
  gatewayPaymentId: paymentIntents.gatewayPaymentId,
  status: paymentIntents.status,
  reviewReason: paymentIntents.reviewReason,
  isSandbox: paymentIntents.isSandbox,
  expiresAt: paymentIntents.expiresAt,
  voidedAt: paymentIntents.voidedAt,
  succeededAt: paymentIntents.succeededAt,
  nextCheckAt: paymentIntents.nextCheckAt,
  checkCount: paymentIntents.checkCount,
};

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async insert(storeId: string, values: Omit<IntentInsert, 'storeId'>) {
    const intents = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(paymentIntents)
        .values({ ...values, storeId })
        .returning(intentColumns),
    );
    return intents[0];
  }

  async find(storeId: string, id: string, lock = false) {
    const [intent] = await this.database.forStore(storeId, (tx) => {
      const query = tx
        .select(intentColumns)
        .from(paymentIntents)
        .where(and(eq(paymentIntents.storeId, storeId), eq(paymentIntents.id, id)));
      return lock ? query.for('no key update') : query;
    });
    return intent;
  }

  async credential(storeId: string, id: string, gateway: PaymentGateway) {
    const [credential] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          mode: paymentGatewayCredentials.mode,
          ciphertext: paymentGatewayCredentials.ciphertext,
          keyVersion: paymentGatewayCredentials.keyVersion,
        })
        .from(paymentGatewayCredentials)
        .where(
          and(
            eq(paymentGatewayCredentials.storeId, storeId),
            eq(paymentGatewayCredentials.id, id),
            eq(paymentGatewayCredentials.gateway, gateway),
            eq(paymentGatewayCredentials.status, 'connected'),
          ),
        ),
    );
    return credential;
  }

  async update(
    storeId: string,
    id: string,
    status: NonNullable<IntentInsert['status']>,
    values: IntentUpdate,
  ) {
    const write = (tx: Transaction) =>
      tx
        .update(paymentIntents)
        .set(values)
        .where(
          and(
            eq(paymentIntents.storeId, storeId),
            eq(paymentIntents.id, id),
            eq(paymentIntents.status, status),
          ),
        )
        .returning({ id: paymentIntents.id });
    return this.database.forStore(storeId, async (tx) => {
      try {
        const [row] = values.gatewayTransactionId ? await tx.transaction(write) : await write(tx);
        return row ? 'updated' : 'unchanged';
      } catch (error) {
        if (isConstraintViolation(error, '23505', 'payment_intents_gateway_transaction_id_key'))
          return 'duplicate';
        throw error;
      }
    });
  }

  async appendEvent(storeId: string, values: Omit<EventInsert, 'storeId'>) {
    const [event] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(paymentEvents)
        .values({ ...values, storeId })
        .onConflictDoNothing({
          target: [paymentEvents.gateway, paymentEvents.gatewayEventId],
        })
        .returning({ id: paymentEvents.id }),
    );
    return event;
  }

  listForOrder(storeId: string, orderId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(intentColumns)
        .from(paymentIntents)
        .where(and(eq(paymentIntents.storeId, storeId), eq(paymentIntents.orderId, orderId)))
        .orderBy(desc(paymentIntents.createdAt)),
    );
  }

  // A link that has not been paid yet stops taking new attempts; one already at the gateway can
  // still settle and then goes to review.
  async voidUnpaid(storeId: string, where: { orderId: string; id?: string }, now: Date) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(paymentIntents)
        .set({ voidedAt: now, updatedAt: now })
        .where(
          and(
            eq(paymentIntents.storeId, storeId),
            eq(paymentIntents.orderId, where.orderId),
            where.id ? eq(paymentIntents.id, where.id) : undefined,
            inArray(paymentIntents.status, ['created', 'pending']),
            isNull(paymentIntents.voidedAt),
          ),
        )
        .returning({ id: paymentIntents.id }),
    );
    return rows.length;
  }

  // What the shop actually holds for an order: verified money less refunds.
  async receivedForOrder(storeId: string, orderId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          received: sql<string>`coalesce(sum(${paymentIntents.verifiedAmountPoisha} - ${paymentIntents.refundedPoisha}), 0)::text`,
        })
        .from(paymentIntents)
        .where(
          and(
            eq(paymentIntents.storeId, storeId),
            eq(paymentIntents.orderId, orderId),
            eq(paymentIntents.isSandbox, false),
            inArray(paymentIntents.status, ['succeeded', 'partially_refunded', 'refunded']),
          ),
        ),
    );
    return Number(row?.received ?? 0);
  }
}
