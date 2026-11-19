import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ChannelTokenHealthService } from '../channel-token-health.service';

export const QUEUE_CHANNEL_TOKEN_CHECKS = 'queue-channel-token-checks';
// The sweep finds due connections across stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: QUEUE_CHANNEL_TOKEN_CHECKS })
export class QueueChannelTokenChecksJob implements JobHandler {
  constructor(
    @Inject(ChannelTokenHealthService) private readonly tokens: ChannelTokenHealthService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.tokens.enqueueDueChecks();
  }
}
