import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { KhataSalesRepository } from './khata-sales.repository';

// A khata sale is a past counter sale kept as an order so it counts in sales numbers and in the
// customer's total. It has no items and nothing to deliver, so it starts delivered and paid and no
// order.created event is sent: no automation, attribution or confirmation runs for it.
@Injectable()
export class KhataSalesService {
  constructor(
    @Inject(KhataSalesRepository) private readonly repository: KhataSalesRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Call it inside the import's transaction. The customer's own record is left as it is, so an
  // undo can still tell it was not edited.
  async record(
    storeId: string,
    sale: { userId: string; contactId: string | null; name: string } & {
      amountPoisha: number;
      soldAt: Date;
    },
  ): Promise<string> {
    const id = newId();
    await this.repository.insert(storeId, {
      ...sale,
      id,
      number: await this.stores.nextOrderNumber(storeId),
    });
    await this.outbox.publish({
      type: 'order.imported',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { orderId: id },
    });
    return id;
  }

  removeUnchanged(storeId: string, orderIds: string[]): Promise<string[]> {
    return this.repository.deleteUnchanged(storeId, orderIds);
  }
}
