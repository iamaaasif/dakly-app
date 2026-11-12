# Dakly

Dakly is a SaaS for Bangladeshi online shops: one inbox for Messenger, Instagram and WhatsApp with AI replies, orders and COD, products, and social auto-post. This repo is the production codebase. The old prototype in `iamaaasif/dakly` is reference only; do not copy code from it.

Stack: NestJS modular monolith (`apps/api`, `apps/worker`), Next.js (`apps/web`), PostgreSQL with row level security, Redis + BullMQ, Drizzle, zod, pnpm + Turborepo.

## Before you write code

1. Read the rule file for the area you touch in `docs/rules/`. They are short.
2. Search `packages/` for an existing helper before writing one. Re-implementing an existing function is the most common AI-written defect.
3. Copy the shape of `packages/core/src/customers/`. Every feature looks like it.

## House rules

- Code is organised by feature (`customers/`, `chats/`, `orders/`), never by layer.
- Controller → service → repository. Controllers only do HTTP. Services hold the rules and never import Drizzle. Repositories only talk to the database and hold no rules.
- A feature uses another feature only through its exported service. Never import another feature's repository, job or internal file. `pnpm lint:boundaries` enforces this.
- Every repository method takes `storeId` first and runs inside `TenantDatabase.forStore`. Every new table with shop data gets `store_id` and an RLS policy in the same PR.
- Never read a store id from the request body, query string or a header. It comes from the verified session only.
- Validate input once, at the edge, with a zod schema from `packages/contracts`. Inside the code, trust the types.
- Services throw `AppError` with a code from the feature's `*.errors.ts`. Never throw `HttpException` from a service. Catch an error only when you can handle it or add context.
- Vendors (Meta, WhatsApp BSP, bKash, Nagad, City Bank, couriers, Claude) live behind a driver interface in `packages/providers`. Vendor payload shapes never reach `packages/core`.
- Money is an integer in poisha (`amountPoisha`), never a float. Times are `timestamptz` in UTC.
- Jobs: one file per job, payload includes `storeId`, handler is idempotent and only calls a service.
- Types over interfaces; string literal unions over `enum`; no `any`, no `as unknown as` outside tests, no `@ts-ignore`.
- No barrel `index.ts` files. Import the file directly.
- Names are full words in the domain's language: `calculateDeliveryCharge`, not `calcDC` or `processData`. No `Manager`, `Helper`, `Util`, `Enhanced` filler.
- Comments explain why, never what. One to three lines. No JSDoc on obvious functions.
- Build only what the current task needs. No options, flags, interfaces or abstractions for imagined future cases. Wait for the third copy before extracting shared code.
- Tests check behaviour (input → result or error), not that mocks were called in some order.

## Commands

```bash
pnpm install
docker compose up -d                 # Postgres 16 + Redis 7
pnpm build                           # builds packages first, then apps
pnpm --filter @dakly/db db:migrate   # needs DATABASE_ADMIN_URL
pnpm dev                             # api :4000, web :3000, worker
pnpm test                            # unit tests
pnpm test:int                        # Postgres tests, needs DATABASE_URL and DATABASE_ADMIN_URL
pnpm check                           # everything CI runs
```

Run `pnpm check` before you open a PR. CI runs the same checks.

## Pull requests

Under about 500 changed lines and one purpose each. Fill in the PR template honestly, including the line that says you read every line of the diff. Schema changes need a migration generated with `pnpm --filter @dakly/db db:generate`; never edit an applied migration.

## Where to look

- `docs/architecture.md`: how the pieces fit and what runs where.
- `docs/rules/`: one file per topic, each with a wrong and right example.
- `docs/adr/`: decisions already made. Do not re-open them in a PR; write a new ADR instead.
