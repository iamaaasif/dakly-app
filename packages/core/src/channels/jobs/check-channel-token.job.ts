import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CHECK_CHANNEL_TOKEN, ChannelTokenHealthService } from '../channel-token-health.service';

export { CHECK_CHANNEL_TOKEN };
const payload = z.strictObject({ storeId: z.uuid() });

@HandlesJob({ queue: QUEUES.sync, name: CHECK_CHANNEL_TOKEN })
export class CheckChannelTokenJob implements JobHandler {
  constructor(
    @Inject(ChannelTokenHealthService) private readonly tokens: ChannelTokenHealthService,
  ) {}

  async handle(data: unknown) {
    const { storeId } = payload.parse(data);
    await this.tokens.checkStore(storeId);
  }
}
