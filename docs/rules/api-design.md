# API routes and controllers

Sources: [Zalando RESTful API guidelines](https://opensource.zalando.com/restful-api-guidelines/) (naming, status codes), [Google AIP-121 and AIP-136](https://google.aip.dev/121) (resources and custom methods), Stripe's API ([idempotency keys](https://docs.stripe.com/api/idempotent_requests), [cursor pagination](https://docs.stripe.com/api/pagination)), and the controllers of [Immich](https://github.com/immich-app/immich/tree/main/server/src/controllers) and [Cal.com](https://github.com/calcom/cal.com/tree/main/apps/api/v2) (thin, one service call each).

## Routes

| Rule                                                   | Example                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Plural nouns, kebab-case, no verbs for plain CRUD      | `GET /orders`, `POST /orders`, `GET /orders/:orderId`                            |
| An action that is not CRUD is a sub-path verb          | `POST /orders/:orderId/confirm`, `POST /conversations/:conversationId/take-over` |
| Nest at most one level                                 | `GET /orders/:orderId/items`, not `/customers/:id/orders/:id/items`              |
| No store id in the path, query or body                 | `GET /orders`, never `GET /stores/:storeId/orders`                               |
| Path params are named for the thing                    | `:orderId`, not `:id`, so logs and errors say which id                           |
| Query params are camelCase                             | `?stage=to_confirm&cursor=...&limit=50`                                          |
| JSON fields are camelCase; DB columns stay snake_case  | `amountPoisha`, `createdAt`                                                      |
| Webhooks and public endpoints have their own prefix    | `/webhooks/meta`, `/public/order-link/:storeSlug`                                |
| Admin routes live on the admin hostname under `/admin` | `/admin/stores`                                                                  |

No URL versioning in release 1: the web app ships with the API. Add `/v1` only when an outside client exists.

## Status codes

| Code | When                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 200  | Read or update that returns a body                                                                         |
| 201  | Created; return the created resource                                                                       |
| 204  | Delete or action with nothing to return                                                                    |
| 400  | Input failed the zod schema (`VALIDATION_FAILED` with field paths)                                         |
| 401  | No valid session (`SESSION_REQUIRED`, `STORE_REQUIRED`)                                                    |
| 403  | Signed in but the role cannot do this (`PERMISSION_DENIED`), or the store is read-only (`STORE_READ_ONLY`) |
| 404  | Not found in this store. Same answer whether the row is missing or belongs to another store                |
| 409  | Conflicts with current state (`ORDER_ALREADY_CONFIRMED`, `STOCK_NOT_AVAILABLE`)                            |
| 422  | Not used; business rule failures are 409 or 400 with a specific code                                       |
| 429  | Rate limited                                                                                               |

## Responses

- Success returns the resource or `{ items, nextCursor }` for lists. No `{ success: true, data: ... }` wrapper.
- Errors are always `{ "error": { "code": "ORDER_NOT_FOUND", "message": "Order not found" } }` from `AppErrorFilter`. Validation errors add `fields: [{ path, message }]`.
- Response types live in `packages/contracts` next to the request schema. The controller's return type is that type.
- Money as integer poisha with an `...Poisha` name. Times as ISO 8601 UTC strings. Ids as UUID strings.
- Never return a database row as is. The repository selects explicit columns; the service maps to the contract type.

## Lists

- Cursor pagination, ordered by a unique key (`createdAt, id`). `limit` default 50, max 100.
- Filters are explicit query params validated by a zod schema. No generic `?filter=` or `?sort=` that maps to any column.

## Writes that move money or send messages

`POST` endpoints that charge, refund, send a campaign, book a courier or create an order from a public page take an `Idempotency-Key` header. The same key with the same body within 24 hours returns the first result.

## Controllers

A controller method reads params and body, checks permission, calls one service method, and returns its result.

```ts
@Controller('orders')
@UseGuards(StoreGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':orderId/confirm')
  @RequirePermission('orders.edit')
  @HttpCode(200)
  confirm(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<OrderResponse> {
    return this.ordersService.confirm(storeId, orderId, { kind: 'user', userId });
  }
}
```

- Every route in a store controller has `StoreGuard` (class level) and `@RequirePermission(...)` (method level). A route without a permission decorator fails a test that walks all routes.
- Bodies and queries go through `ZodValidationPipe` with the contracts schema. No class-validator, no DTO classes with decorators.
- No `@Res()`, no `reply.send()`; return the value (see [http-fastify.md](http-fastify.md)).
- No try/catch in controllers. `AppErrorFilter` handles errors.
- One controller per resource. A controller over about 10 routes means the feature should be split.

Wrong:

```ts
@Get()
async list(@Query() query: any, @Req() req: FastifyRequest) {
  const storeId = req.headers['x-store-id'] as string;
  const rows = await this.db.select().from(orders).where(eq(orders.storeId, storeId));
  return { success: true, data: rows };
}
```

Right:

```ts
@Get()
@RequirePermission('orders.view')
list(
  @CurrentStore() storeId: string,
  @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
): Promise<OrderListResponse> {
  return this.ordersService.list(storeId, query);
}
```
