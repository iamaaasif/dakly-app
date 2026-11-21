import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SubscriptionRenewalService } from '../subscription-renewal.service';

export const RENEW_SUBSCRIPTION = 'renew-subscription';
const renewSubscriptionSchema = z.strictObject({ storeId: z.uuid() });

@HandlesJob({ queue: QUEUES.payments, name: RENEW_SUBSCRIPTION })
export class RenewSubscriptionJob implements JobHandler {
  constructor(
    @Inject(SubscriptionRenewalService) private readonly renewals: SubscriptionRenewalService,
  ) {}

  async handle(data: unknown) {
    const { storeId } = renewSubscriptionSchema.parse(data);
    await this.renewals.renew(storeId);
  }
}
