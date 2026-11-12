# Jobs and events

Background work runs in `apps/worker` with BullMQ. A job lives in its feature: `packages/core/src/<feature>/jobs/<verb>-<noun>.job.ts`.

```ts
export const SEND_ORDER_CONFIRMATION = 'send-order-confirmation';

export const sendOrderConfirmationSchema = z.object({
  storeId: z.uuid(),
  orderId: z.uuid(),
});

@Processor(QUEUES.messaging)
export class SendOrderConfirmationJob extends WorkerHost {
  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { storeId, orderId } = sendOrderConfirmationSchema.parse(job.data);
    await this.ordersService.sendConfirmation(storeId, orderId);
  }
}
```

Rules:

- The payload always has `storeId` and is parsed with zod.
- The handler only parses and calls a service. Logic lives in the service so HTTP and jobs share it.
- Jobs are idempotent: running twice has the same effect as once (check "already sent" before sending). BullMQ retries.
- Pass ids, not whole objects. Load fresh data inside the job.
- Queues are named by concern (`messaging`, `ai`, `payments`, `webhooks`), defined once in `platform/queue`.
- Cross-feature reactions use events: the owner emits `OrderPaidEvent`, other features listen. For anything that must not be lost, write the event to the outbox table in the same transaction (architecture doc).
