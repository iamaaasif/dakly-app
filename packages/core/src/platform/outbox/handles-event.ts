import { Reflector } from '@nestjs/core';

import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';

import { HandlesJob } from '../queue/job-handler';
import type { QueueName } from '../queue/queues';

// Not a discovery decorator: Nest discovers a class by one decorator only, and that is HandlesJob.
export const SubscribedEvent = Reflector.createDecorator<{
  type: DaklyEvent['type'];
  retryBackoffMs?: number;
}>();

// The class name is the subscriber's job name, so the queue's dispatcher routes the relayed job
// to it and the job id `<eventId>-<subscriber>` stays the same across relay retries.
export function HandlesEvent(
  type: DaklyEvent['type'],
  { queue, retryBackoffMs }: { queue: QueueName; retryBackoffMs?: number },
): ClassDecorator {
  return (target) => {
    SubscribedEvent({ type, retryBackoffMs })(target);
    HandlesJob({ queue, name: target.name })(target);
  };
}
