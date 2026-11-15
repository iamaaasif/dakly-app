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
node scripts/development-encryption.mjs
pnpm install
docker compose up -d
pnpm build
set -a && . ./.env && set +a
pnpm --filter @dakly/db db:migrate
pnpm dev
```

The API runs on http://localhost:4000 (`GET /health`), the web app on http://localhost:3000.
The web client calls `/api/*` on its own origin. Next.js forwards that prefix to
the local API on port 4000; the production load balancer provides the same route.

`REDIS_URL` accepts `redis://` or `rediss://` (TLS), including encoded credentials.
An optional database path such as `/1` selects that logical database. Invalid
schemes, negative database numbers and non-integer paths fail at startup.

### Resetting the local database

Until PR #6 merges, the release 1 migrations (0003 to 0014) may still be rewritten. A database migrated from an earlier revision of that PR fails with errors such as `relation "platform_settings" already exists`. Local data is disposable, so drop the volume and migrate again:

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

Account two-step verification requires encryption keys. After copying `.env.example` to `.env`, run `node scripts/development-encryption.mjs` once to generate development-only keys without printing them. Keep that file private. CI generates a separate ephemeral key per run. Production supplies `ENCRYPTION_CURRENT_KEY_VERSION` and `ENCRYPTION_MASTER_KEYS` through secret configuration; never generate replacement keys for existing encrypted data.
