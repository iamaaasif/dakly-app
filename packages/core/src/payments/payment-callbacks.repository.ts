import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';

import { gateways } from '@dakly/contracts/payments';
import type { Database } from '@dakly/db/client';
import { webhookEvents } from '@dakly/db/schema/platform';
import type { PaymentGateway } from '@dakly/providers/payment/payment-driver';

import { DATABASE } from '../platform/database/database.tokens';

type Headers = Record<string, string | string[] | undefined>;
const attempts = sql`coalesce(${webhookEvents.payload}->'attempts', '{}'::jsonb)`;

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
    { body, headers, attemptId }: { body: string; headers: Headers; attemptId: string },
    now: Date,
  ) {
    const payload = { body, attempts: { [attemptId]: headers } };
    const [receipt] = await this.database
      .insert(webhookEvents)
      .values({ provider: gateway, externalId, payload, receivedAt: now })
      .onConflictDoUpdate({
        target: [webhookEvents.provider, webhookEvents.externalId],
        set: {
          // Keep queued signatures independent when deliveries share a body.
          payload: sql`case when (select count(*) from jsonb_object_keys(${attempts})) < 32
            then jsonb_set(excluded.payload, '{attempts}', ${attempts} || (excluded.payload->'attempts'))
            else ${webhookEvents.payload} end`,
          status: 'received',
          processedAt: null,
          receivedAt: sql`case when ${webhookEvents.status} = 'received' then ${webhookEvents.receivedAt} else excluded.received_at end`,
        },
        setWhere: ne(webhookEvents.status, 'processed'),
      })
      .returning({ id: webhookEvents.id, accepted: sql<boolean>`${attempts} ? ${attemptId}` });
    return receipt;
  }

  async findReceived(id: string, attemptId: string) {
    const headers = sql<Headers>`${attempts}->${attemptId}::text`;
    const [receipt] = await this.database
      .select({
        provider: webhookEvents.provider,
        body: sql<string>`${webhookEvents.payload}->>'body'`,
        headers,
      })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.id, id),
          inArray(webhookEvents.provider, gateways),
          eq(webhookEvents.status, 'received'),
          isNotNull(headers),
        ),
      );
    return receipt;
  }

  listReceivedBefore(before: Date, after?: string) {
    return this.database
      .select({
        id: webhookEvents.id,
        receivedAt: webhookEvents.receivedAt,
        attemptIds: sql<string[]>`array(select jsonb_object_keys(${attempts}))`,
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

  async finish(
    id: string,
    attemptId: string,
    status: 'processed' | 'ignored' | 'failed',
    now: Date,
  ) {
    const remaining = sql`${attempts} - ${attemptId}::text`;
    const finished = status === 'processed' ? sql`true` : sql`${remaining} = '{}'::jsonb`;
    await this.database
      .update(webhookEvents)
      .set({
        status: sql`case when ${finished} then ${status} else 'received' end`,
        processedAt: sql`case when ${finished} then ${now.toISOString()}::timestamptz end`,
        payload: sql`case when not ${finished} then jsonb_set(${webhookEvents.payload}, '{attempts}', ${remaining}) end`,
      })
      .where(
        and(
          eq(webhookEvents.id, id),
          inArray(webhookEvents.provider, gateways),
          ne(webhookEvents.status, 'processed'),
          status === 'processed' ? undefined : sql`${attempts} ? ${attemptId}`,
        ),
      );
  }
}
