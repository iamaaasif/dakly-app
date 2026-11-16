import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../queue/job-handler';
import { QUEUES } from '../../queue/queues';
import { OutboxRelayService } from '../outbox-relay.service';

export const RELAY_OUTBOX = 'relay-outbox';
export const RELAY_OUTBOX_INTERVAL_MS = 1000;

// A scheduled sweep over the global outbox, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.transactional, name: RELAY_OUTBOX })
export class RelayOutboxJob implements JobHandler {
  constructor(@Inject(OutboxRelayService) private readonly outboxRelay: OutboxRelayService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.outboxRelay.relay();
  }
}
