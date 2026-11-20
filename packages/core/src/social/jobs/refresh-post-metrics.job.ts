import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SocialInsightsService } from '../social-insights.service';

export const REFRESH_POST_METRICS = 'refresh-post-metrics';

const payload = z.strictObject({ storeId: z.uuid(), postTargetId: z.uuid() });

@HandlesJob({ queue: QUEUES.sync, name: REFRESH_POST_METRICS })
export class RefreshPostMetricsJob implements JobHandler {
  constructor(@Inject(SocialInsightsService) private readonly insights: SocialInsightsService) {}

  async handle(data: unknown) {
    const { storeId, postTargetId } = payload.parse(data);
    await this.insights.refreshMetrics(storeId, postTargetId);
  }
}
