# Rules

One file per topic. Each rule is short, says why, names the open-source projects it follows, and shows one wrong and one right example. When a rule changes, change it here and in `CLAUDE.md` in the same PR. Where a rule can be checked by a tool, it is, and the file says which command.

## Everywhere

| File                                             | Covers                                          |
| ------------------------------------------------ | ----------------------------------------------- |
| [simplicity.md](simplicity.md)                   | Plain code; signs of AI-written code to remove  |
| [naming-and-comments.md](naming-and-comments.md) | Names, files, comments                          |
| [writing.md](writing.md)                         | Docs, UI copy and commits without filler        |
| [testing.md](testing.md)                         | Unit, integration, end to end                   |
| [security.md](security.md)                       | Secrets, untrusted input, personal data, limits |
| [pull-requests.md](pull-requests.md)             | Size, review, what reviewers reject             |

## Backend

| File                                                 | Covers                                               |
| ---------------------------------------------------- | ---------------------------------------------------- |
| [layers.md](layers.md)                               | Controller, service, repository                      |
| [api-design.md](api-design.md)                       | Routes, status codes, responses, controllers         |
| [services.md](services.md)                           | Where business rules live and how they look          |
| [database.md](database.md)                           | Tables, migrations, repositories, transactions       |
| [multi-tenancy.md](multi-tenancy.md)                 | `storeId`, RLS, new tables                           |
| [auth-and-permissions.md](auth-and-permissions.md)   | Sessions, permissions, masking                       |
| [validation-and-errors.md](validation-and-errors.md) | zod at the edge, `AppError`                          |
| [module-boundaries.md](module-boundaries.md)         | What a feature may import                            |
| [http-fastify.md](http-fastify.md)                   | Fastify do and don't, webhook raw body               |
| [providers.md](providers.md)                         | Vendor drivers                                       |
| [jobs.md](jobs.md)                                   | BullMQ jobs and events                               |
| [ai-and-llm.md](ai-and-llm.md)                       | Model calls, tools, prompts, evals                   |
| [logging.md](logging.md)                             | Logs, errors, metrics                                |
| [scale.md](scale.md)                                 | Pagination, bulk work, counters, performance budgets |

## Frontend

| File                                                     | Covers                                        |
| -------------------------------------------------------- | --------------------------------------------- |
| [frontend.md](frontend.md)                               | Folders, routes, server and client components |
| [frontend-components.md](frontend-components.md)         | Writing components, states, AI content        |
| [frontend-styling.md](frontend-styling.md)               | Tailwind, theme tokens, `packages/ui`         |
| [frontend-data-and-state.md](frontend-data-and-state.md) | React Query, URL state, client state          |
| [frontend-forms.md](frontend-forms.md)                   | React Hook Form with shared zod schemas       |
| [frontend-accessibility.md](frontend-accessibility.md)   | Keyboard, labels, phone width, Bangla text    |

## What the tools check

| Command                | Checks                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`            | ESLint (size and complexity limits, no `any`, no `as unknown as` outside tests, no `@ts-ignore`, no enums, no `console`, no barrels, no Express; in the web apps no default exports outside `app/`, no inline money formatting, the rules of hooks and complete effect dependencies; no hex colours in the web apps or `packages/ui`) and `lint:boundaries`                       |
| `pnpm lint:boundaries` | dependency-cruiser: feature boundaries, `platform/` knows no feature, layers (only services, use-case files, jobs, repositories and modules import a repository), database package only from repositories, contracts import only zod, providers know no core, web apps never import `packages/core` or `packages/db`, web feature boundaries and shared code, no circular imports |
| `pnpm lint:docs`       | Filler words and emoji in docs and comments, banned file names, broken relative links, task tracker format, the ER diagram is current                                                                                                                                                                                                                                             |
| `pnpm lint:unused`     | Knip: unused files, exports, dependencies                                                                                                                                                                                                                                                                                                                                         |
| `pnpm lint:duplicates` | jscpd: copy-paste                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm db:drift`        | The Drizzle schema and the committed migrations agree                                                                                                                                                                                                                                                                                                                             |
| `pnpm check`           | `format:check`, `build`, `lint`, `typecheck`, `db:drift`, unit tests, `lint:unused`, `lint:duplicates` and `lint:docs`                                                                                                                                                                                                                                                            |

`scripts/lint-rules.spec.mjs`, part of `pnpm test`, lints a broken fixture for each ESLint and dependency-cruiser rule above and expects that rule to fail; the fixtures are in `scripts/lint-fixtures/`.

CI runs everything in `pnpm check` and also `pnpm audit --prod --audit-level high`, `pnpm test:int`, `pnpm test:e2e`, a gitleaks secret scan and the pr-rules check on branch name, titles and size ([pull-requests.md](pull-requests.md)).
