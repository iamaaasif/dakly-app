import { DiscoveryService } from '@nestjs/core';

import type { QueueName } from './queues';

export type JobHandler = { handle(data: unknown): Promise<void> };

export const HandlesJob = DiscoveryService.createDecorator<{ queue: QueueName; name: string }>();
