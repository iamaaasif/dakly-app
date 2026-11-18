import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { walletCreditedEventSchema } from '@dakly/contracts/events/wallets';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationsService } from '../automations.service';

// Only an SMS top-up ends a pause for a short SMS balance. A repeat run finds nothing to resume.
@HandlesEvent('wallet.credited', { queue: QUEUES.workflow })
export class ResumeWorkflowsOnWalletCredited implements JobHandler {
  constructor(@Inject(AutomationsService) private readonly automations: AutomationsService) {}

  async handle(data: unknown) {
    const { storeId, payload } = walletCreditedEventSchema.extend({ id: z.uuid() }).parse(data);
    if (payload.wallet === 'sms_credits')
      await this.automations.resumeAfterTopUp(storeId, payload.entryId, { kind: 'system' });
  }
}
