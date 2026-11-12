# Rules

One file per topic. Each rule is short, says why, and shows one wrong and one right example. When a rule changes, change it here and in `CLAUDE.md` in the same PR.

| File                                                 | Covers                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| [layers.md](layers.md)                               | Controller, service, repository              |
| [module-boundaries.md](module-boundaries.md)         | What a feature may import                    |
| [multi-tenancy.md](multi-tenancy.md)                 | `storeId`, RLS, new tables                   |
| [validation-and-errors.md](validation-and-errors.md) | zod at the edge, `AppError`                  |
| [providers.md](providers.md)                         | Vendor drivers                               |
| [jobs.md](jobs.md)                                   | BullMQ jobs and events                       |
| [testing.md](testing.md)                             | Unit, integration, end to end                |
| [frontend.md](frontend.md)                           | Next.js feature folders                      |
| [naming-and-comments.md](naming-and-comments.md)     | Names, files, comments                       |
| [simplicity.md](simplicity.md)                       | Keeping code plain; signs of AI-written code |
| [pull-requests.md](pull-requests.md)                 | Size, review, what reviewers reject          |
