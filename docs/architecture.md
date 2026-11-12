# Architecture

The full design is in the [Dakly architecture doc](https://claude.ai/artifact/7fyrptKfhe9WNvH4pQTsQJ) and the [PRD](https://claude.ai/artifact/B24GPU5sw3LtFFwgsbXZzD). This page is the short version for working in the code.

```text
apps/
  api/        NestJS HTTP API, webhook intake. Imports feature modules from core.
  worker/     NestJS without HTTP. Same modules; runs BullMQ jobs and schedules.
  web/        Next.js shop app.
packages/
  core/       Features (customers/, later chats/, orders/, products/, social/, ai/, billing/)
              and platform/ (config, errors, tenancy, database, queue).
  contracts/  zod schemas and response types shared by api and web.
  db/         Drizzle schema, migrations, RLS policies.
  providers/  Driver interfaces and vendor drivers (Meta, WhatsApp BSP, bKash, couriers, Claude).
```

Dependencies point one way: `apps → core → (db, contracts, providers)`. `platform/` is the base inside core; features depend on it, never the reverse.

## Request path

1. Request reaches `apps/api`. (Auth middleware, not built yet, verifies the session and sets `request.storeId`.)
2. `StoreGuard` rejects requests with no store.
3. The controller parses input with a zod schema and calls a service.
4. The service applies rules and calls repositories, other features' services and drivers.
5. Repositories run queries inside `TenantDatabase.forStore`, so Postgres RLS limits every query to that store.
6. Errors are `AppError`s, turned into `{ error: { code, message } }` by `AppErrorFilter`.

## Runtime

Beta runs on one DigitalOcean Droplet; managed PostgreSQL and managed Valkey (Redis); Cloudflare R2 for files; Cloudflare in front. The API and worker scale out separately when needed. See ADR 0001 for when parts split out of the monolith.

## What is built

Only the skeleton: platform pieces, the `customers` example feature, driver interfaces for channels and payments, and the web feature-folder example. Auth is the next piece; until it exists every store route returns `401 STORE_REQUIRED`.
