import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsSummariesService, BUILD_ORDER_SUMMARY } from '../analytics-summaries.service';

const payload = z.strictObject({ storeId: z.uuid(), day: z.iso.date() });

@HandlesJob({ queue: QUEUES.sync, name: BUILD_ORDER_SUMMARY })
export class BuildOrderSummaryJob implements JobHandler {
  constructor(
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
  ) {}

  async handle(data: unknown) {
    const { storeId, day } = payload.parse(data);
    await this.summaries.refreshOrderDays(storeId, { from: day, through: day });
  }
}
