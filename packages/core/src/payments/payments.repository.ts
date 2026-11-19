import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

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
  constructor(private readonly database: TenantDatabase) {}

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
}
