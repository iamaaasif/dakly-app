import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { gateways } from '@dakly/contracts/payments';
import type { Database } from '@dakly/db/client';
import { webhookEvents } from '@dakly/db/schema/platform';
import type { PaymentGateway } from '@dakly/providers/payment/payment-driver';

import { DATABASE } from '../platform/database/database.tokens';

type PaymentWebhookPayload = {
  body: string;
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class PaymentCallbacksRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByReference(reference: string) {
    const { rows } = await this.database.execute<{ store_id: string; payment_intent_id: string }>(
      sql`select store_id, payment_intent_id from payment_intent_for_reference(${reference})`,
    );
    return rows[0];
  }

  async dueChecks(limit: number) {
    const { rows } = await this.database.execute<{ store_id: string; payment_intent_id: string }>(
      sql`select store_id, payment_intent_id from due_payment_checks(${limit})`,
    );
    return rows;
  }

  async save(
    gateway: PaymentGateway,
    externalId: string,
    payload: PaymentWebhookPayload,
    now: Date,
  ) {
    const [receipt] = await this.database
      .insert(webhookEvents)
      .values({ provider: gateway, externalId, payload, receivedAt: now })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
      .returning({ id: webhookEvents.id });
    return receipt;
  }

  async findReceived(id: string) {
    const [receipt] = await this.database
      .select({
        provider: webhookEvents.provider,
        payload: sql<PaymentWebhookPayload>`${webhookEvents.payload}`,
      })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.id, id),
          inArray(webhookEvents.provider, gateways),
          eq(webhookEvents.status, 'received'),
        ),
      );
    return receipt;
  }

  listReceivedBefore(before: Date, after?: string) {
    return this.database
      .select({
        id: webhookEvents.id,
        receivedAt: webhookEvents.receivedAt,
      })
      .from(webhookEvents)
      .where(
        and(
          inArray(webhookEvents.provider, gateways),
          eq(webhookEvents.status, 'received'),
          lt(webhookEvents.receivedAt, before),
          after ? gt(webhookEvents.id, after) : undefined,
        ),
      )
      .orderBy(webhookEvents.id)
      .limit(100);
  }

  async finish(id: string, status: 'processed' | 'ignored' | 'failed', now: Date) {
    await this.database
      .update(webhookEvents)
      .set({ status, processedAt: now, payload: null })
      .where(
        and(
          eq(webhookEvents.id, id),
          inArray(webhookEvents.provider, gateways),
          eq(webhookEvents.status, 'received'),
        ),
      );
  }
}
