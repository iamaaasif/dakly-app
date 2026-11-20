import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { attributionRebuildContinuedEventSchema } from '@dakly/contracts/events/stores';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AttributionRebuildService } from '../attribution-rebuild.service';

const event = attributionRebuildContinuedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('attribution.rebuild_continued', { queue: QUEUES.bulk })
export class ContinueAttributionRebuild implements JobHandler {
  constructor(
    @Inject(AttributionRebuildService) private readonly rebuild: AttributionRebuildService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.rebuild.runPage(storeId, payload.rebuildId, payload.afterOrderId);
  }
}
