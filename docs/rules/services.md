# Services

The service is where Dakly's business rules live. Read [layers.md](layers.md) first. Sources: [Immich's services](https://github.com/immich-app/immich/tree/main/server/src/services) (one service per domain, tested with fake repositories), [Novu's use cases](https://github.com/novuhq/novu/tree/next/apps/api/src/app) (one file per action once a service grows), and [Documenso's AppError](https://github.com/documenso/documenso/blob/main/packages/lib/errors/app-error.ts).

## Rules

1. One service per feature to start (`OrdersService`). Past about 400 lines, move each action into its own use-case file (`orders/confirm-order.ts`) that the service calls. Do not add more layers.
2. Every public method takes `storeId` first. Methods that change data also take the actor: `{ kind: 'user', userId }`, `{ kind: 'ai', aiRunId }` or `{ kind: 'system' }`, so the audit log and stage events say who did it.
3. Inputs are the contract types, already parsed. Do not re-validate.
4. Throw `AppError` with a code from the feature's `*.errors.ts`. Never `HttpException`, never a bare `Error` for a business case.
5. State changes follow a table in code (`order-stage.ts`), not scattered `if` checks.
6. Use another feature through its service or its events. Never its repository ([module-boundaries.md](module-boundaries.md)).
7. A service never reads `process.env`, never imports Drizzle, never knows about HTTP (no request objects, no status codes).
8. Vendor calls go through a driver from `packages/providers`, with credentials passed in. No `fetch` to a vendor from a service.
9. Time comes from an injected clock (`Clock.now()`), so tests can set it. No `new Date()` for business decisions.
10. Money is integer poisha. Do arithmetic in poisha; never divide to Taka until the screen.
11. Methods are named for the business action: `confirmOrder`, `takeOverConversation`, `bookCourier`. Not `update`, `process`, `handle`.
12. A method over 60 lines or with complexity over 10 fails lint; split it into named private steps.

Wrong:

```ts
async update(id: string, data: any) {
  const order = await this.ordersRepository.findById(id);
  if (data.stage === 'to_pack' && order.stage !== 'to_confirm' && order.stage !== 'on_hold') {
    throw new BadRequestException('bad stage');
  }
  return this.ordersRepository.update(id, data);
}
```

Right:

```ts
async changeStage(storeId: string, orderId: string, change: StageChange, actor: Actor): Promise<OrderResponse> {
  const order = await this.ordersRepository.findById(storeId, orderId);
  if (!order) throw new AppError(ORDER_ERRORS.ORDER_NOT_FOUND);
  if (!canMoveToStage(order.stage, change.to)) throw new AppError(ORDER_ERRORS.ORDER_STAGE_NOT_ALLOWED);

  return this.ordersRepository.moveStage(storeId, orderId, order.stage, change, actor);
}
```

## Tests

Unit test every rule and every error code with fake repositories and drivers. Test the result or the thrown code, not which mocks were called ([testing.md](testing.md)).
