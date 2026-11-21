import { Controller, Get, Inject } from '@nestjs/common';

import type { KnowledgeSummaryResponse } from '@dakly/contracts/knowledge';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { KnowledgeSummaryService } from './knowledge-summary.service';

@Controller('ai-agent/knowledge-summary')
export class KnowledgeSummaryController {
  constructor(@Inject(KnowledgeSummaryService) private readonly summary: KnowledgeSummaryService) {}

  @Get()
  @RequirePermission('storeSettings.view')
  view(@CurrentStore() storeId: string): Promise<KnowledgeSummaryResponse> {
    return this.summary.view(storeId);
  }
}
