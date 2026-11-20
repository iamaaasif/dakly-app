import { Inject, Injectable } from '@nestjs/common';

import { daklyEventSchema, type DaklyEvent } from '@dakly/contracts/events/dakly-event';

import { StoreTransaction } from '../database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { OutboxRepository } from './outbox.repository';

const PURGE_BATCH = 5000;

@Injectable()
export class OutboxService {
  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  // The event must commit or roll back with the change it describes, so it only joins the
  // caller's store transaction and never opens one. Joining fails if the event names another store.
  async publish(event: DaklyEvent) {
    await this.publishAll([event]);
  }

  // One insert for all the events; they share the open transaction, so they must share its store.
  async publishAll(events: DaklyEvent[]) {
    const parsed = events.map((event) => daklyEventSchema.parse(event));
    if (!this.transaction.isOpen())
      throw new AppError('STORE_TRANSACTION_REQUIRED', PLATFORM_ERRORS.STORE_TRANSACTION_REQUIRED);
    const storeId = parsed[0]?.storeId;
    if (!storeId) return;
    if (parsed.some((event) => event.storeId !== storeId))
      throw new AppError('OUTBOX_STORE_MISMATCH', PLATFORM_ERRORS.OUTBOX_STORE_MISMATCH);
    await this.repository.insert(
      storeId,
      parsed.map(({ type, payload, occurredAt }) => ({
        type,
        payload,
        occurredAt: new Date(occurredAt),
      })),
    );
  }

  // Published events are kept 7 days. The daily maintenance job calls this until a batch is short.
  async purgePublished(): Promise<void> {
    while ((await this.repository.purgePublishedBatch(PURGE_BATCH)) === PURGE_BATCH);
  }
}
