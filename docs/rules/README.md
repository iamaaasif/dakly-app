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

| File                                                 | Covers                                         |
| ---------------------------------------------------- | ---------------------------------------------- |
| [layers.md](layers.md)                               | Controller, service, repository                |
| [api-design.md](api-design.md)                       | Routes, status codes, responses, controllers   |
| [services.md](services.md)                           | Where business rules live and how they look    |
| [database.md](database.md)                           | Tables, migrations, repositories, transactions |
| [multi-tenancy.md](multi-tenancy.md)                 | `storeId`, RLS, new tables                     |
| [auth-and-permissions.md](auth-and-permissions.md)   | Sessions, permissions, masking                 |
| [validation-and-errors.md](validation-and-errors.md) | zod at the edge, `AppError`                    |
| [module-boundaries.md](module-boundaries.md)         | What a feature may import                      |
| [http-fastify.md](http-fastify.md)                   | Fastify do and don't, webhook raw body         |
| [providers.md](providers.md)                         | Vendor drivers                                 |
| [jobs.md](jobs.md)                                   | BullMQ jobs and events                         |
| [ai-and-llm.md](ai-and-llm.md)                       | Model calls, tools, prompts, evals             |
| [logging.md](logging.md)                             | Logs, errors, metrics                          |

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

| Command                | Checks                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`            | ESLint (size and complexity limits, no `any`, no enums, no barrels, no Express, no default exports or hex colours in web features, no inline money formatting) and `lint:boundaries` |
| `pnpm lint:boundaries` | dependency-cruiser: feature boundaries, layers, web shared code, providers                                                                                                           |
| `pnpm lint:docs`       | Filler words and emoji in docs and comments, banned file names, task tracker format                                                                                                  |
| `pnpm lint:unused`     | Knip: unused files, exports, dependencies                                                                                                                                            |
| `pnpm lint:duplicates` | jscpd: copy-paste                                                                                                                                                                    |
| `pnpm check`           | All of the above plus format, typecheck and unit tests. CI runs the same.                                                                                                            |
