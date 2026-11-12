# Providers: vendors behind drivers

Every outside service sits behind one small interface in `packages/providers/src/<capability>/`, with one folder per vendor:

```text
packages/providers/src/
  channel/   channel-driver.ts   messenger/ instagram/ whatsapp/
  payment/   payment-driver.ts   bkash/ nagad/ citybank/
  courier/   courier-driver.ts   pathao/ steadfast/ redx/
  llm/       llm-driver.ts       claude/
```

- The interface uses Dakly's words and types. The driver translates the vendor's JSON into them.
- Vendor payload types never appear in `packages/core`.
- Drivers do no business logic: no "if the order is COD then...". That belongs in a service.
- Credentials are passed in per call (each shop connects its own accounts), never read from a global.
- Every driver call has a timeout and returns a clear error code when the vendor fails.
- Add an interface only for vendors. Inside Dakly, use concrete classes until a second implementation really exists.

**Why:** WhatsApp BSPs, couriers and gateways change. Swapping one should touch one folder.
