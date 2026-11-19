import { DiscoveryService } from '@nestjs/core';

import type { QueueName } from './queues';

export type JobHandler = {
  handle(data: unknown, finalAttempt: boolean): Promise<void | { delayUntil: number }>;
};

export const HandlesJob = DiscoveryService.createDecorator<{ queue: QueueName; name: string }>();
