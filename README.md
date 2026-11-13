# Dakly

One inbox, orders and AI replies for online shops in Bangladesh: Messenger, Instagram and WhatsApp chats, COD orders, products and social auto-post.

This repository is the production codebase. It is a pnpm + Turborepo monorepo:

| Path                 | What                                                         |
| -------------------- | ------------------------------------------------------------ |
| `apps/api`           | NestJS HTTP API                                              |
| `apps/worker`        | NestJS background worker (BullMQ)                            |
| `apps/web`           | Next.js shop app                                             |
| `packages/core`      | Feature modules and platform code shared by api and worker   |
| `packages/contracts` | zod schemas and types shared by api and web                  |
| `packages/db`        | Drizzle schema, migrations, row level security               |
| `packages/providers` | Driver interfaces for Meta, WhatsApp, payments, couriers, AI |

Start with [CLAUDE.md](CLAUDE.md) for the house rules, then [docs/architecture.md](docs/architecture.md) and [docs/rules](docs/rules/).

## Setup

Needs Node 22, pnpm 10 and Docker.

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm build
set -a && . ./.env && set +a
pnpm --filter @dakly/db db:migrate
pnpm dev
```

The API runs on http://localhost:4000 (`GET /health`), the web app on http://localhost:3000.

### Resetting the local database

Until release 1 ships, migration 0003 may still be rewritten in place, and the review fixes once in 0004 are now part of it. A database migrated from an older revision of 0003 or 0004 fails with `relation "platform_settings" already exists`. Local data is disposable, so drop the volume and migrate again:

```bash
docker compose down -v
docker compose up -d
pnpm --filter @dakly/db db:migrate
pnpm --filter @dakly/db db:seed
```

Once any shared or production database has applied a migration, it is never edited again; changes go in a new migration.

## Checks

```bash
pnpm test        # unit tests
pnpm test:int    # integration tests against Postgres (needs the .env values exported)
pnpm check       # format, lint, module boundaries, typecheck, tests, dead code, duplicates
```

CI runs the same checks on every pull request.
