import { Inject, Injectable } from '@nestjs/common';

import { daklyEventSchema, type DaklyEvent } from '@dakly/contracts/events/dakly-event';

import { StoreTransaction } from '../database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxService {
  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  // The event must commit or roll back with the change it describes, so it only joins the
  // caller's store transaction and never opens one.
  async publish(storeId: string, event: DaklyEvent) {
    const { type, storeId: eventStoreId, occurredAt, payload } = daklyEventSchema.parse(event);
    if (!this.transaction.isOpen())
      throw new AppError('STORE_TRANSACTION_REQUIRED', PLATFORM_ERRORS.STORE_TRANSACTION_REQUIRED);
    if (eventStoreId !== storeId)
      throw new AppError('EVENT_STORE_MISMATCH', PLATFORM_ERRORS.EVENT_STORE_MISMATCH);
    await this.repository.insert(storeId, { type, payload, occurredAt: new Date(occurredAt) });
  }
}
