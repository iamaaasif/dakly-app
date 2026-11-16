# Jobs and events

Background work runs in `apps/worker` with BullMQ. A job lives in its feature: `packages/core/src/<feature>/jobs/<verb>-<noun>.job.ts`.

```ts
export const SEND_ORDER_CONFIRMATION = 'send-order-confirmation';

export const sendOrderConfirmationSchema = z.object({
  storeId: z.uuid(),
  orderId: z.uuid(),
});

@HandlesJob({ queue: QUEUES.transactional, name: SEND_ORDER_CONFIRMATION })
export class SendOrderConfirmationJob implements JobHandler {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  async handle(data: unknown) {
    const { storeId, orderId } = sendOrderConfirmationSchema.parse(data);
    await this.ordersService.sendConfirmation(storeId, orderId);
  }
}
```

The code that enqueues it passes the same constant: `queue.add(SEND_ORDER_CONFIRMATION, { storeId, orderId }, options)`.

Rules:

- The payload always has `storeId` and is parsed with zod. The exception is a platform-wide sweep or account job with no store (security notices, staff alerts, staff audit maintenance): its payload says so in a comment and holds only global ids.
- The handler only parses and calls a service. Logic lives in the service so HTTP and jobs share it.
- Each queue has one worker, a dispatcher in `platform/queue/job-dispatcher.ts`, that routes each job to its handler by `job.name`. Mark the handler with `@HandlesJob({ queue, name })`, export the name as a constant from the handler file, and enqueue with that constant. Two handlers for the same queue and name stop the worker at startup. A job with no handler fails at once and is not retried.
- The dispatcher runs the handler inside the job log context, reports a failure once through `ErrorReporter`, writes the security log line and rethrows a plain error, so BullMQ never stores the original message. Handlers do not catch errors themselves.
- Worker concurrency is set per queue in the dispatcher, in one place. `apps/worker` registers only the queues that have handlers, and the dispatcher for each.
- Jobs are idempotent: running twice has the same effect as once (check "already sent" before sending). BullMQ retries.
- Repeating work is a BullMQ job scheduler, never `setInterval`. `apps/worker` registers each one at startup with `scheduleJob(queue, name)` from `platform/queue/job-schedule.ts`: the job name is the fixed scheduler id, so every worker upserts the same scheduler and BullMQ creates one job per interval, which only one worker takes. The job runs through the dispatcher like any other, with three attempts and exponential backoff. The `transactional` queue runs five jobs at once and `bulk` one, so a transactional run longer than the interval overlaps the next one even on one worker, and any run can overlap one on another worker. The service it calls must tolerate that (leases, `SKIP LOCKED`, deduplicated job ids).
- Pass ids, not whole objects. Load fresh data inside the job.
- Queues are the ones in [architecture.md](../architecture.md#queues), defined once in `platform/queue`: `inbound`, `ai-reply`, `transactional`, `outbound`, `campaign`, `workflow`, `sync`, `bulk`, `payments`. Do not add a queue without updating that table.
- One store must not hold up another: `campaign`, `bulk` and `sync` jobs run with a per-store concurrency cap, and AI replies take a per-store Valkey semaphore (Q15).
- Bulk work (imports, exports, segment rebuilds, campaign sends, attribution recalculation) is always a job with progress, never inside a request.
- Failed jobs retry with exponential backoff, then go to a dead-letter list that raises an alert.
- Cross-feature reactions use events: the owner emits `OrderPaidEvent`, other features listen. For anything that must not be lost, write the event to the outbox table in the same transaction (architecture doc).
