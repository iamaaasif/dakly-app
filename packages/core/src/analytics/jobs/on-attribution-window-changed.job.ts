import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { attributionWindowChangedEventSchema } from '@dakly/contracts/events/analytics';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AttributionRebuildService } from '../attribution-rebuild.service';

const event = attributionWindowChangedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('attribution.window_changed', { queue: QUEUES.bulk })
export class OnAttributionWindowChanged implements JobHandler {
  constructor(
    @Inject(AttributionRebuildService) private readonly rebuild: AttributionRebuildService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.rebuild.runPage(storeId, payload.rebuildId);
  }
}
