# Layers: controller, service, repository

Calls go one way: controller → service → repository. No layer skips one, and none calls backwards.

| Layer      | Does                                                                                   | Never does                                                    |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Controller | Reads params and body, checks permission, calls one service method, returns the result | Business rules, database calls, vendor calls                  |
| Service    | All business rules, calls repositories, other features' services and drivers           | Imports Drizzle or SQL, reads `process.env`, knows about HTTP |
| Repository | Queries for one feature's tables, explicit column lists, returns plain objects         | Business rules, throws business errors, calls other services  |

**Why:** a job, a webhook and an HTTP request can all reuse a service. Rules in a controller have to be copied.

`pnpm lint:boundaries` fails when a controller, guard, pipe, decorator or other file with a role suffix imports a repository. Only `*.service.ts`, `*.job.ts`, `*.repository.ts`, `*.module.ts`, specs and use-case files without a role suffix may. The other directions in the table are checked in review.

Wrong:

```ts
@Post(':id/confirm')
async confirm(@CurrentStore() storeId: string, @Param('id') id: string) {
  const order = await this.db.select().from(orders).where(eq(orders.id, id));
  if (order[0]?.status !== 'draft') throw new BadRequestException('Cannot confirm');
  // ...
}
```

Right:

```ts
@Post(':id/confirm')
confirm(@CurrentStore() storeId: string, @Param('id', ParseUUIDPipe) id: string) {
  return this.ordersService.confirm(storeId, id);
}
```

Small features keep one service. When a service passes about 400 lines, split it into use-case files (`confirm-order.ts`), not into more layers.
