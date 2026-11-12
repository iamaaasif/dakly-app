# Module boundaries

Each folder in `packages/core/src/` (except `platform/`) is a feature and a NestJS module. A feature may use another feature only through its `*.module.ts`, `*.service.ts` or `*.events.ts` file.

**Why:** if `orders` reads the `customers` table directly, a change to customers silently breaks orders. Going through the service keeps one owner per table.

Wrong:

```ts
// packages/core/src/orders/orders.service.ts
import { CustomersRepository } from '../customers/customers.repository';
```

Right:

```ts
import { CustomersService } from '../customers/customers.service';
```

Other rules, all checked by `pnpm lint:boundaries` (`.dependency-cruiser.cjs`):

- `platform/` never imports a feature.
- Only `*.repository.ts` files and `platform/database/` import `@dakly/db` or `drizzle-orm`.
- `packages/contracts` imports nothing but zod, because the browser uses it.
- A web feature (`apps/web/src/features/x`) never imports another web feature.
- No circular imports.

When feature A must react to something in feature B (order paid → send WhatsApp receipt), B emits an event and A listens. B does not call A.
