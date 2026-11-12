# Validation and errors

## Validate once, at the edge

Every request body, query, webhook and job payload is parsed with a zod schema before any logic runs. Request schemas live in `packages/contracts/src/<feature>.ts` so the web form uses the same rules.

```ts
@Post()
create(@CurrentStore() storeId: string, @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput) {
  return this.customersService.create(storeId, input);
}
```

After parsing, trust the types. Do not re-check `if (!input.name)` inside services.

Webhooks (Meta, payment gateways) verify the signature first, then parse with zod, then enqueue a job. They do no work inline.

## One error type

Services throw `AppError` with a code from the feature's `*.errors.ts`:

```ts
const ORDER_ERRORS = {
  ORDER_NOT_FOUND: { status: 404, message: 'Order not found' },
  ORDER_ALREADY_CONFIRMED: { status: 409, message: 'This order is already confirmed' },
} as const satisfies ErrorCatalog;
```

`AppErrorFilter` turns it into `{ "error": { "code": "ORDER_NOT_FOUND", "message": "Order not found" } }`. Unknown errors become `500 INTERNAL_ERROR` and are logged; their details never reach the client.

Wrong:

```ts
try {
  await this.ordersRepository.insert(storeId, order);
} catch (error) {
  console.log(error);
  throw error;
}
```

Right: no try/catch. Catch only when you can recover (retry, fall back) or turn a known database error into a business error, and say why in one comment.
