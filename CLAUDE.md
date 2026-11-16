# Dakly

Dakly is a SaaS for Bangladeshi online shops: one inbox for Messenger, Instagram and WhatsApp with AI replies, orders and COD, products, and social auto-post. This repo is the production codebase. The old prototype in `iamaaasif/dakly` is reference only; do not copy code from it.

Stack: NestJS modular monolith (`apps/api`, `apps/worker`), Next.js (`apps/web`), PostgreSQL with row level security, Valkey + BullMQ, Drizzle, zod, pnpm + Turborepo.

## Before you write code

1. Find the task in `docs/tasks.md` and set it to `In progress`. Read its feature doc in `docs/features/`. Check `docs/product/open-questions.md` for anything that blocks it.
2. Follow the build steps in `docs/development/workflow.md`: contract, schema and migration, repository, service, controller, jobs, then the web screen.
3. Read the rule file for each area you touch in `docs/rules/`. They are short.
4. Search `packages/` for an existing helper before writing one. Re-implementing an existing function is the most common AI-written defect.
5. Copy the shape of `packages/core/src/customers/`. Every feature looks like it.

## House rules

- Code is organised by feature (`customers/`, `chats/`, `orders/`), never by layer.
- Controller → service → repository. Controllers only do HTTP. Services hold the rules and never import Drizzle. Repositories only talk to the database and hold no rules.
- A feature uses another feature only through its exported service. Never import another feature's repository, job or internal file. `pnpm lint:boundaries` enforces this.
- Every repository method takes `storeId` first and runs inside `TenantDatabase.forStore`. Every new table with shop data gets `store_id` and an RLS policy in the same PR.
- Never read a store id from the request body, query string or a header. It comes from the verified session only.
- The API runs on Fastify, not Express. Never use Express types or packages (`express`, `multer`, `helmet`, `@nestjs/platform-express`); see `docs/rules/http-fastify.md`. Verify webhook signatures against `req.rawBody`, never a re-serialised body.
- Validate input once, at the edge, with a zod schema from `packages/contracts`. Inside the code, trust the types.
- Services throw `AppError` with a code from the feature's `*.errors.ts`. Never throw `HttpException` from a service. Catch an error only when you can handle it or add context.
- Vendors (Meta, WhatsApp BSP, bKash, Nagad, City Bank, SMS, email, OpenAI) live behind a driver interface in `packages/providers`. Vendor payload shapes never reach `packages/core`.
- Money is an integer in poisha (`amountPoisha`), never a float. Times are `timestamptz` in UTC.
- Jobs: one file per job, payload includes `storeId`, handler is idempotent and only calls a service.
- Types over interfaces; string literal unions over `enum`; no `any`, no `as unknown as` outside tests, no `@ts-ignore`.
- No barrel `index.ts` files. Import the file directly.
- Names are full words in the domain's language: `calculateDeliveryCharge`, not `calcDC` or `processData`. No `Manager`, `Helper`, `Util`, `Enhanced` filler.
- Comments explain why, never what. One to three lines. No JSDoc on obvious functions.
- Build only what the current task needs. No options, flags, interfaces or abstractions for imagined future cases. Wait for the third copy before extracting shared code.
- Tests check behaviour (input → result or error), not that mocks were called in some order.
- Never hold a database transaction or row lock while calling the AI model or any vendor.
- AI calls go through `AiService` with a tier, never a model name; tools never take a store id, contact id or price.
- Web: React Query for server data, the URL for filters and tabs, React Hook Form with the contracts schema for forms. Theme tokens only; no hex colours, no inline money formatting, named exports outside `app/`.
- Docs, comments, UI copy and commits use plain words: no filler, no emoji, no lines saying a tool wrote it. See `docs/rules/writing.md`.

## Commands

```bash
pnpm install
docker compose up -d                 # Postgres 16 + Valkey 8
pnpm build                           # builds packages first, then apps
pnpm --filter @dakly/db db:migrate   # needs DATABASE_ADMIN_URL
pnpm dev                             # api :4000, web :3000, worker
pnpm test                            # unit tests
pnpm test:int                        # Postgres tests, needs DATABASE_URL and DATABASE_ADMIN_URL
pnpm lint:docs                       # filler words, emoji, file names, links, task tracker
pnpm check                           # format, build, lint, typecheck, drift, unit tests, knip, jscpd, docs
```

Run `pnpm check` before you open a PR. CI also runs `pnpm audit`, `pnpm test:int`, `pnpm test:e2e`, a secret scan and the PR rules check, which `pnpm check` does not.

## Pull requests

Under about 500 changed lines and one purpose each. Name the branch `<type>/<task-id>-<what-it-does>`, such as `feat/acc-3-sessions`; never a tool default like `codex/...` (see `docs/rules/pull-requests.md`). Update the feature doc and the task's row in `docs/tasks.md` in the same PR. Fill in the PR template honestly, including the line that says you read every line of the diff. Schema changes need a migration generated with `pnpm --filter @dakly/db db:generate`; never edit an applied migration.

## Where to look

- `docs/README.md`: map of all docs.
- `docs/product/`: what Dakly is, release scope, glossary, decisions, open questions.
- `docs/features/`: one file per feature with its rules, screens and data.
- `docs/design/`: screenshots of the design prototype (layout only) and theme tokens.
- `docs/development/`: how to build a feature, and the release 1 build order.
- `docs/tasks.md`: every release 1 task and its status.
- `docs/architecture.md`: how the pieces fit and what runs where.
- `docs/rules/`: one file per topic, each with a wrong and right example.
- `docs/adr/`: decisions already made. Do not re-open them in a PR; write a new ADR instead.
