import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { VERIFY_PAYMENT } from './jobs/verify-payment.job';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PaymentCallbacksService } from './payment-callbacks.service';
import { PaymentSettlementsRepository } from './payment-settlements.repository';

const PAGE_SIZE = 100;
export const RECONCILE_PAYMENT_SETTLEMENTS = 'reconcile-payment-settlements';
const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
  removeOnFail: 100,
};

@Injectable()
export class PaymentJobsService {
  constructor(
    @Inject(PaymentCallbacksRepository) private readonly callbacks: PaymentCallbacksRepository,
    @Inject(PaymentCallbacksService) private readonly intake: PaymentCallbacksService,
    @Inject(PaymentSettlementsRepository)
    private readonly settlements: PaymentSettlementsRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.payments) private readonly queue: Queue,
  ) {}

  async scheduleChecks() {
    const due = await this.callbacks.dueChecks(PAGE_SIZE);
    const bucket = Math.floor(this.clock.now().getTime() / JOB_POLL_INTERVAL_MS);
    await this.queue.addBulk(
      due.map(({ store_id: storeId, payment_intent_id: paymentIntentId }) => ({
        name: VERIFY_PAYMENT,
        data: { storeId, paymentIntentId },
        opts: {
          ...jobOptions,
          jobId: `${VERIFY_PAYMENT}-${paymentIntentId}-${bucket}`,
          removeOnComplete: true,
        },
      })),
    );
    await this.intake.recoverPending();
  }

  async scheduleSettlements() {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(
      this.clock.now(),
    );
    let after: string | null = null;
    for (;;) {
      const stores = await this.stores.maintenanceStoreIds(after, PAGE_SIZE);
      await this.queue.addBulk(stores.map((storeId) => settlementJob(storeId, day, null)));
      if (stores.length < PAGE_SIZE) return;
      after = stores.at(-1) ?? null;
    }
  }

  async reconcile(storeId: string, day: string, after: string | null) {
    const rows = await this.settlements.candidates(storeId, after, PAGE_SIZE);
    const ids = rows
      .filter((row) => row.verifiedAmountPoisha === row.amountPoisha)
      .map((row) => row.lineId);
    if (ids.length) await this.settlements.match(storeId, ids, this.clock.now());
    const last = rows.at(-1);
    if (rows.length === PAGE_SIZE && last)
      await this.queue.addBulk([settlementJob(storeId, day, last.lineId)]);
  }
}

function settlementJob(storeId: string, day: string, after: string | null) {
  return {
    name: RECONCILE_PAYMENT_SETTLEMENTS,
    data: { storeId, day, after },
    opts: {
      ...jobOptions,
      jobId: `${RECONCILE_PAYMENT_SETTLEMENTS}-${storeId}-${day}-${after ?? 'start'}`,
      removeOnComplete: { age: DAY_MS / 1000 },
    },
  };
}
