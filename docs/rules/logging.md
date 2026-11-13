# Logging and monitoring

Sources: [pino](https://getpino.io) via [nestjs-pino](https://github.com/iamolegga/nestjs-pino), the [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) Node SDK, and [Sentry for NestJS](https://docs.sentry.io/platforms/javascript/guides/nestjs/).

## Rules

1. Use the Nest `Logger` (backed by pino, JSON in production). No `console` (lint enforces it).
2. Every log line carries `requestId` or `jobId`, and `storeId` when there is one. The logger adds them from context; do not pass them by hand.
3. Log events, not progress. One line when something meaningful happens ("courier booked", "payment verified"), not "entering function", "step 2 done".
4. Levels: `error` for something a person must look at; `warn` for a handled failure that may need a look (vendor timeout, retry); `log` for business events; `debug` off in production.
5. Log an error once, where it is handled. Do not log and rethrow.
6. Message is a fixed sentence; details go in fields: `logger.warn({ orderId, courier: 'pathao' }, 'Courier booking timed out')`. No string interpolation of ids into the message.
7. Never log personal data or secrets ([security.md](security.md)).
8. Unknown errors go to Sentry with the request or job id. Expected business errors (`AppError` with 4xx) do not.
9. Every vendor call records duration and outcome as a metric (Meta, OpenAI, gateways, couriers, SMS).
10. Every AI call writes an `ai_runs` row with tokens, cost, model, prompt version and duration. That table is the AI cost report; do not log prompts or replies.

Wrong:

```ts
console.log('Sending message to ' + contact.phone + ': ' + text);
try {
  await this.channelDriver.send(...);
} catch (error) {
  this.logger.error(error);
  throw error;
}
```

Right:

```ts
await this.channelDriver.send(...);
this.logger.log({ messageId, channel }, 'Message sent');
```
