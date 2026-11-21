import { Inject, Injectable } from '@nestjs/common';

import type { KnowledgeSummaryResponse } from '@dakly/contracts/knowledge';

import { DeliveryService } from '../delivery/delivery.service';
import { ProductsService } from '../products/products.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';

@Injectable()
export class KnowledgeSummaryService {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
  ) {}

  // Store rules are what the agent reads outside Knowledge: each delivery charge and the
  // shop's extra rules, which count as one.
  async view(storeId: string): Promise<KnowledgeSummaryResponse> {
    const [productsCount, zonesCount, { extraRules }] = await Promise.all([
      this.products.countForChat(storeId),
      this.delivery.countZones(storeId),
      this.settings.view(storeId),
    ]);
    return { productsCount, storeRulesCount: zonesCount + (extraRules?.trim() ? 1 : 0) };
  }
}
