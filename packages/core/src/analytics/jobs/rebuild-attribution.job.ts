import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  AttributionRebuildService,
  REBUILD_ATTRIBUTION,
  rebuildAttributionSchema,
} from '../attribution-rebuild.service';

@HandlesJob({ queue: QUEUES.bulk, name: REBUILD_ATTRIBUTION })
export class RebuildAttributionJob implements JobHandler {
  constructor(
    @Inject(AttributionRebuildService) private readonly rebuild: AttributionRebuildService,
  ) {}

  async handle(data: unknown) {
    const { storeId, rebuildId } = rebuildAttributionSchema.parse(data);
    await this.rebuild.runPage(storeId, rebuildId);
  }
}
