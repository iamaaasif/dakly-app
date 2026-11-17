# Providers: vendors behind drivers

Every outside service sits behind one small interface in `packages/providers/src/<capability>/`, with one folder per vendor:

```text
packages/providers/src/
  channel/   channel-driver.ts   messenger/ instagram/ whatsapp/
  payment/   payment-driver.ts   bkash/ nagad/ citybank/
  courier/   courier-driver.ts   (later release, D21)
  llm/       llm-driver.ts       openai/
  sms/       sms-driver.ts       alpha-sms/ ssl-wireless/
  email/     email-driver.ts     sendgrid/ smtp/
  file-storage/ file-storage-driver.ts s3/
```

- The interface uses Dakly's words and types. The driver translates the vendor's JSON into them.
- Vendor payload types never appear in `packages/core`.
- Drivers do no business logic: no "if the order is COD then...". That belongs in a service.
- Credentials are passed in per call (each shop connects its own accounts), never read from a global.
- Every driver call has a timeout and returns a clear error code when the vendor fails. A timeout means the outcome is unknown, not a refusal: a sending driver says a vendor refused only when it is sure (for SMS, `SmsSendRefused`), so the caller can retry under the same idempotency key.
- Add an interface only for vendors. Inside Dakly, use concrete classes until a second implementation really exists.

**Why:** WhatsApp BSPs, couriers and gateways change. Swapping one should touch one folder. Release 1 uses OpenAI for AI (decision D17); adding another model provider later is a new folder under `llm/`.

The driver for each capability is chosen by config, not by code. Email is the first example: `EMAIL_DRIVER=sendgrid` in production, `EMAIL_DRIVER=smtp` pointed at Mailpit (`docker compose`) in local development and integration tests (decision D22). Features call `EmailService`, never a driver directly.

File storage has one driver: `S3FileStorageDriver` speaks plain S3, so Cloudflare R2 in production and SeaweedFS (`docker compose`) in local development and integration tests differ only in the `R2_*` values.
