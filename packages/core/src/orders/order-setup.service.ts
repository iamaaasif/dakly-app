import { Inject, Injectable } from '@nestjs/common';

import { OrderSetupRepository } from './order-setup.repository';

@Injectable()
export class OrderSetupService {
  constructor(@Inject(OrderSetupRepository) private readonly repository: OrderSetupRepository) {}

  // For the Dashboard setup checklist: has any customer ordered through a chat.
  hasChatOrder(storeId: string): Promise<boolean> {
    return this.repository.hasChatOrder(storeId);
  }
}
