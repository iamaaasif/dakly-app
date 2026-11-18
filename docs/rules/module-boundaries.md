# Module boundaries

Each folder in `packages/core/src/` (except `platform/`) is a feature and a NestJS module. A feature may use another feature only through its `*.module.ts`, `*.service.ts` or `*.events.ts` file.

**Why:** if `orders` reads the `contacts` table directly, a change to contacts silently breaks orders. Going through the service keeps one owner per table.

Wrong:

```ts
// packages/core/src/orders/orders.service.ts
import { ContactsRepository } from '../contacts/contacts.repository';
```

Right:

```ts
import { ContactsService } from '../contacts/contacts.service';
```

Other rules, all checked by `pnpm lint:boundaries` (`.dependency-cruiser.cjs`):

- `platform/` never imports a feature.
- Only `*.repository.ts` files and `platform/database/` import `@dakly/db` or `drizzle-orm`; `apps/api` and `apps/worker` never do.
- Controllers, guards, pipes, decorators and other files with a role suffix never import a repository. Services, their use-case files, jobs, other repositories and `*.module.ts` wiring may ([layers.md](layers.md)).
- `packages/contracts` imports nothing but zod, because the browser uses it.
- `packages/providers` never imports `packages/core`, `packages/db` or an app.
- A web feature (`apps/web/src/features/x`) never imports another web feature.
- `apps/web` and `apps/admin` never import `packages/core` or `packages/db`.
- No circular imports. Cycles through the web apps' `@/` alias are not seen, because dependency-cruiser does not resolve it.

When feature A must react to something in feature B (order paid → send WhatsApp receipt), B emits an event and A listens. B does not call A.

## Read-only reads across features

A few queries must join another feature's table to stay one indexed query. They read only, the owner keeps every write, and each one is listed here.

| Reader     | Tables                                                                                       | Why                                                                    | Who owns writes            |
| ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `contacts` | `contact_consent_current`                                                                    | Compiling segment conditions on consent into the contacts count        | `consents`                 |
| `sending`  | `campaign_recipients`, `campaigns`, `automation_run_steps`, `automation_runs`, `automations` | The frequency cap counts campaign and workflow sends together (A1, A2) | `campaigns`, `automations` |
