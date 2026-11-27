import { Inject, Injectable } from '@nestjs/common';

import type { OrderTabCounts } from '@dakly/contracts/order-inquiries';
import type { StoreAccess } from '@dakly/contracts/team';

import { OrderStageCountsService } from '../orders/order-stage-counts.service';
import { OrderInquiriesService } from './order-inquiries.service';

@Injectable()
export class OrderTabCountsService {
  constructor(
    @Inject(OrderStageCountsService) private readonly stages: OrderStageCountsService,
    @Inject(OrderInquiriesService) private readonly inquiries: OrderInquiriesService,
  ) {}

  async forStore(storeId: string, access: StoreAccess): Promise<OrderTabCounts> {
    const [counts, pending, inquiries] = await Promise.all([
      this.stages.byStage(storeId),
      this.stages.awaitingAdvance(storeId),
      this.inquiries.count(storeId, access),
    ]);
    return {
      inquiries,
      to_confirm: counts.to_confirm,
      on_hold: counts.on_hold,
      to_pack: counts.to_pack,
      with_courier: counts.with_courier,
      delivered: counts.delivered,
      pending,
      returned: counts.returned,
    };
  }
}
