import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { webhookEvents } from '@dakly/db/schema/platform';

import { DATABASE } from '../platform/database/database.tokens';

const eventColumns = { id: webhookEvents.id, status: webhookEvents.status };

@Injectable()
export class MetaWebhooksRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // A delivery may cover several stores. Its row is global until the worker routes it.
  async saveDelivery(externalId: string, payload: Record<string, unknown>, receivedAt: Date) {
    const [inserted] = await this.database
      .insert(webhookEvents)
      .values({ provider: 'meta', externalId, payload, receivedAt })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
      .returning(eventColumns);
    if (inserted) return inserted;

    // Use a new statement so a duplicate can see a concurrent insert after it commits.
    const [existing] = await this.database
      .select(eventColumns)
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, 'meta'), eq(webhookEvents.externalId, externalId)))
      .limit(1);
    return existing;
  }
}
